import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { Glob } from "bun";

/**
 * `expect.poll` の predicate に **リトライしない locator 観測**を置かせない gate。
 *
 * ## なぜ
 *
 * `locator.isVisible()` / `isEnabled()` / `isChecked()` 等は web-first assertion と違い
 * **その瞬間の値を 1 回返すだけ**でリトライしない。これを `expect.poll` の中で
 * `page.goto()` と組み合わせると、次の反復が新しい `goto` を撃って解決途中の DOM を
 * 捨てるため、**timeout の予算が原理的に使えず poll は永遠に勝てない**。
 *
 * `goto` は `load` で解決する一方、Next.js のページ本体は `loading.tsx` の Suspense
 * fallback が差し替わる 100〜600ms 後に現れる。つまり probe はほぼ必ず skeleton を見る。
 *
 * 実測（CI run 30631140902 / 30632351655、trace のタイムスタンプ）:
 * `feature-module-off-gate.spec.ts` の not-found 境界は poll 窓の中で **4 回描画されて
 * いた**のに、5 反復すべてが false を返して 20 秒で失格した。retry 3 回とも同じ。
 *
 * 正しい形は「単発 `goto` + リトライする web-first assertion」:
 *
 * ```ts
 * await page.goto(route);
 * await expect(notFoundHeading(page)).toBeVisible({ timeout: ROUTE_TIMEOUT_MS });
 * ```
 *
 * `expect.poll` を使ってよいのは **DB / API を直接読む**ような「リトライ機構を自前で
 * 持たない値」の観測だけ（例: `isReservationSeriesCancelled(seriesId)`）。
 */

const root = process.cwd();

/** リトライしない locator 観測メソッド（web-first assertion の対義）。 */
const NON_RETRYING_LOCATOR_PROBES = [
  "isVisible",
  "isHidden",
  "isEnabled",
  "isDisabled",
  "isChecked",
  "isEditable",
] as const;

function listE2ESpecs(): string[] {
  const glob = new Glob("e2e/**/*.spec.ts");
  return [...glob.scanSync(root)].map((p) => p.split(sep).join("/")).sort();
}

/**
 * `expect.poll(` から対応する閉じ括弧までを粗く切り出す。
 *
 * 正規表現ではネストした括弧を数えられないので、開き括弧の深さを数えて範囲を取る。
 */
function extractPollPredicates(source: string): string[] {
  const predicates: string[] = [];
  const marker = ".poll(";

  for (
    let start = source.indexOf(marker);
    start !== -1;
    start = source.indexOf(marker, start + marker.length)
  ) {
    let depth = 0;
    for (let i = start + marker.length - 1; i < source.length; i += 1) {
      const char = source[i];
      if (char === "(") depth += 1;
      else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          predicates.push(source.slice(start, i + 1));
          break;
        }
      }
    }
  }

  return predicates;
}

/**
 * `expect.poll` の predicate 内の遷移呼び出し。
 *
 * poll は予算が尽きた瞬間に **進行中の predicate を見捨てる**（中断はしない）。
 * predicate が `page.goto` を含むと遷移だけが in-flight で残り、呼び出し側の
 * retry が撃つ次の遷移と衝突して
 * `Navigation to X is interrupted by another navigation to X` になる。
 *
 * 実測（CI run 31566511073、`feature-module-off-gate.spec.ts` の `contact OFF`）:
 * 遷移の上限 30 秒が poll の予算 15 秒より長かったため、遅い遷移 1 回で
 * 必ずこの形に落ちた。復元 hook が中止されて共有 DB が汚れ、`afterAll` の
 * 汚染検出まで巻き込んだ。
 *
 * 直し方: `expect.poll` をやめ、1 反復を必ず最後まで await する自前ループにする
 * （期限は反復と反復の**間**でだけ見る）。見本は同 spec の `reloadUntil`。
 */
const NAVIGATION_IN_PREDICATE = /\.(?:goto|reload|goBack|goForward)\s*\(/u;

/**
 * predicate が **helper 経由**で遷移していないかも見る。
 *
 * 直接の `.goto(` だけを見ると**この gate が対象にしている欠陥そのものを
 * 見逃す**。実際に落ちた形は
 * `expect.poll(async () => { await openFeatureSettings(page); ... })` で、
 * predicate の字面に `.goto(` は 1 度も出てこない。
 *
 * ## 粗さ（承知のうえ）
 *
 * **同一ファイル・1 段だけ**辿る。別ファイルから import した helper や、
 * helper がさらに別の helper を呼ぶ 2 段以上は追わない。ここを完全にやるなら
 * AST + import 解決が要るが、実際に踏んだ形（spec 内 helper の 1 段）は
 * これで塞がる。取りこぼしが出たら正規表現を広げずに AST へ移すこと。
 */
function navigatingHelperNames(source: string): string[] {
  const names: string[] = [];
  const declaration = /(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gu;

  for (const match of source.matchAll(declaration)) {
    const name = match[1];
    if (name === undefined) continue;
    const body = extractFunctionBody(source, match.index ?? 0);
    if (NAVIGATION_IN_PREDICATE.test(body)) names.push(name);
  }

  return names;
}

/** 関数シグネチャの後ろの `{ ... }` を波括弧の深さで切り出す。 */
function extractFunctionBody(source: string, signatureStart: number): string {
  // 引数の分割代入（`function f({ a })`）を本体と取り違えないよう、
  // 引数リストを閉じてから最初の `{` を本体の開始とみなす。
  let depth = 0;
  let paramsEnd = -1;
  for (let i = source.indexOf("(", signatureStart); i < source.length; i += 1) {
    const char = source[i];
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        paramsEnd = i;
        break;
      }
    }
  }
  if (paramsEnd === -1) return "";

  const open = source.indexOf("{", paramsEnd);
  if (open === -1) return "";

  depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return "";
}

/** predicate が直接 / helper 経由で遷移していれば、その呼び出し名を返す。 */
function navigationCallInPredicate(
  predicate: string,
  helpers: readonly string[],
): string | null {
  const direct = NAVIGATION_IN_PREDICATE.exec(predicate);
  if (direct) return direct[0];

  for (const name of helpers) {
    if (new RegExp(`\\b${name}\\s*\\(`, "u").test(predicate)) {
      return `${name}()`;
    }
  }
  return null;
}

describe("expect.poll の predicate はリトライする待ちを使う", () => {
  test("poll の中で遷移していない（孤児の navigation を残さない）", () => {
    const offenders = listE2ESpecs().flatMap((rel) => {
      const source = readFileSync(join(root, ...rel.split("/")), "utf8");
      const helpers = navigatingHelperNames(source);
      return extractPollPredicates(source).flatMap((predicate) => {
        const call = navigationCallInPredicate(predicate, helpers);
        return call === null
          ? []
          : [`${rel}: expect.poll の predicate が ${call} を呼んでいる`];
      });
    });

    expect(offenders).toEqual([]);
  });

  test("遷移検出の見本（gate の判別力）", () => {
    const detect = (source: string): (string | null)[] => {
      const helpers = navigatingHelperNames(source);
      return extractPollPredicates(source)
        .map((predicate) => navigationCallInPredicate(predicate, helpers))
        .filter((call) => call !== null);
    };

    // 1. 直接の遷移は落ちる
    expect(
      detect(
        `await expect.poll(async () => { await page.goto(PATH); return read(); }).toBe(x);`,
      ),
    ).toEqual([".goto("]);
    expect(
      detect(
        `await expect.poll(async () => { await page.reload(); return read(); }).toBe(x);`,
      ),
    ).toEqual([".reload("]);

    // 2. **helper 経由も落ちる。** これが実際に落ちた形（CI run 31566511073）で、
    //    predicate の字面には `.goto(` が 1 度も出てこない。直接呼び出しだけを
    //    見る gate は、自分が対象にしている欠陥を素通りさせる。
    expect(
      detect(
        `async function openFeatureSettings(page: Page): Promise<void> {
           await page.goto(FEATURES_SETTINGS_PATH, { timeout: NAV_MS });
         }
         await expect.poll(async () => {
           await openFeatureSettings(page);
           return readModuleState(page, label);
         }, { timeout: PERSIST_MS }).toBe(desired);`,
      ),
    ).toEqual(["openFeatureSettings()"]);

    // 3. 遷移しない helper 経由は通る（helper 呼び出し一般を禁止しない）
    expect(
      detect(
        `async function readModuleState(page: Page) {
           return page.getByRole("switch").getAttribute("aria-checked");
         }
         await expect.poll(() => readModuleState(page)).toBe("true");`,
      ),
    ).toEqual([]);

    // 4. DB / API を読むだけの predicate は poll の正しい用途
    expect(
      detect(
        `await expect.poll(() => isReservationSeriesCancelled(id)).toBe(true);`,
      ),
    ).toEqual([]);

    // 5. poll の**外**の遷移は対象外（自前ループの正しい形）
    expect(
      detect(`await page.goto(PATH); await expect.poll(() => read()).toBe(x);`),
    ).toEqual([]);
  });

  test("poll の中でリトライしない locator 観測を呼んでいない", () => {
    const probePattern = new RegExp(
      `\\.(${NON_RETRYING_LOCATOR_PROBES.join("|")})\\s*\\(`,
      "u",
    );

    const offenders = listE2ESpecs().flatMap((rel) => {
      const source = readFileSync(join(root, ...rel.split("/")), "utf8");
      return extractPollPredicates(source)
        .filter((predicate) => probePattern.test(predicate))
        .map(
          (predicate) =>
            `${rel}: expect.poll の predicate が ${probePattern.exec(predicate)?.[1] ?? "?"}() を呼んでいる`,
        );
    });

    expect(offenders).toEqual([]);
  });

  test("gate が空振りしていない（spec を実際に走査している）", () => {
    const specs = listE2ESpecs();
    expect(specs.length).toBeGreaterThan(0);

    // 少なくとも 1 つの spec は expect.poll を使っている（抽出器の sanity check）。
    const withPoll = specs.filter((rel) => {
      const source = readFileSync(join(root, ...rel.split("/")), "utf8");
      return extractPollPredicates(source).length > 0;
    });
    expect(withPoll.length).toBeGreaterThan(0);
  });
});
