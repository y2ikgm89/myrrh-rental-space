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

describe("expect.poll の predicate はリトライする待ちを使う", () => {
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
