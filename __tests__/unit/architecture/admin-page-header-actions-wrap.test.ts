import { readFileSync } from "node:fs";
import { join, sep } from "node:path";

import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

/**
 * admin ページヘッダーの操作ボタン列が 390px で折り返すことの gate。
 *
 * ## なぜ機械化するか
 *
 * 「h1 の隣にボタンを並べる列が mobile で横溢れする」は **3 回別々に修正されている**:
 * PR #1714 (`/admin/reservations`)、#1726 (`/admin/faq`)、そして
 * `/admin/events`（本 gate と同時に修正）。いずれも
 * `e2e/authenticated/admin/responsive-shell.spec.ts` が実測で拾ってから 1 ページずつ
 * 直す形になっており、E2E は opt-in の広域 run でしか回らないので発見が遅い。
 *
 * さらに**ボタンの数は権限で変わる**。`/admin/events` は PR #1729 が
 * `event:manage` を付与して「全参加者CSV」が描画されるようになった結果 4 個になり、
 * 390px で 503px を占めて溢れた（run 30631098725 実測: htmlScrollWidth 519 / client 390）。
 * つまり「今は収まっている」は将来の保証にならない。
 *
 * ## 何を違反とするか
 *
 * `<h1>` を含むヘッダーブロックの**直下の子 div** のうち、
 * `flex … gap-2` を持ち `flex-wrap` が無いものを違反とする。
 * 収まっている間 `flex-wrap` は無効果なので、常時付けても副作用は無い。
 *
 * 汎用の「全 flex 行に flex-wrap」は採らない（フォーム内やテーブルセルなど
 * 折り返してはいけない列が admin だけで 170 箇所以上あり偽陽性になる）。
 *
 * ## 絞り込みの理由（Codex P2 指摘の反映）
 *
 * 前身はラッパー class の出現位置から 1200 文字の固定幅を走査していた。
 * ユーティリティクラスの一致だけで判定すると、同じ
 * `flex flex-col gap-4 sm:flex-row sm:items-center` を使う **filter bar**
 * （`CategoryFilters` の checkbox + label 列）や、ヘッダーブロックを通り越して拾った
 * **pagination 列**（`media/loading.tsx`）まで巻き込む。
 * 折り返してはいけない列に `flex-wrap` を強制する偽陽性なので、構造で絞る:
 *
 * 1. `<div>` の対応を数えてヘッダーブロックを**閉じタグまで**取り出す
 * 2. そのブロックが **`<h1>` を含む**ことを要求する（= 実際のページヘッダー）
 * 3. **直下の子 div** だけを操作列候補にする（孫要素は見ない）
 * 4. 候補は**全件**検査する（最初の 1 件で打ち切ると、先頭が折り返し済みのときに
 *    後続の未対応行を見逃す）
 *
 * ### `<h1>` を持たないヘッダー形を外してよい理由
 *
 * 除外されるのは filter bar と loading skeleton
 * （`DetailLoading` / `FormLoading` / `faq` / `media` / dashboard の `loading.tsx`）。
 * skeleton の操作列は固定幅の `<Skeleton>` だけで構成され、実測で
 * 200px（`w-24` × 2）/ 264px（`w-32` × 2）/ 148px（`w-11` × 3）と 390px に収まり、
 * **権限やデータで個数が変わらない**。この gate が守っている「将来ボタンが増えて
 * 溢れる」経路が構造的に存在しないので、除外しても守るものが減らない。
 *
 * ## 走査の限界
 *
 * 母集合の入口はクラス集合の包含（並び順に依存しない）。操作列は
 * `className` リテラルと `cn()` の文字列引数を見る。`cn()` の変数引数は見えない。
 *
 * JSX の AST ではなくテキストの `<div>` 対応数えなので、
 * コメントや文字列リテラルの中に `<div>` / `</div>` を書くと深さがずれる。
 * 自己閉じ `<div … />` と開始タグ内の JSX 式（`onClick={() => …}`）は
 * `findTagEnd` / `divTokens` が扱う（どちらも取りこぼすと**無言で**
 * ブロック抽出が壊れるため、fixture で固定してある）。
 */

const ADMIN_DASHBOARD_GLOB = "src/app/(admin)/admin/(dashboard)/**/*.tsx";

/** ページヘッダーのラッパー（h1 + 操作列を横並びにする house pattern）。 */
const HEADER_CLASSNAME = "flex flex-col gap-4 sm:flex-row sm:items-center";

/**
 * house pattern のクラス集合。並び順に依存しない。
 * `flex` は `flex-col` / `sm:flex-row` の部分一致では足りない（トークン境界）。
 */
const HEADER_CLASS_LOOKAHEAD =
  /(?=[^>]*(?:^|[\s"'`])flex(?:[\s"'`]|$))(?=[^>]*(?:^|[\s"'`])flex-col(?:[\s"'`]|$))(?=[^>]*(?:^|[\s"'`])gap-4(?:[\s"'`]|$))(?=[^>]*(?:^|[\s"'`])sm:flex-row(?:[\s"'`]|$))(?=[^>]*(?:^|[\s"'`])sm:items-center(?:[\s"'`]|$))/u;

/** `<div` / `</div` のトークン。 */
const DIV_TOKEN_SOURCE = "<\\/?div\\b";

/**
 * `lastIndex` を持ち回さないよう、走査のたびに新しい global 正規表現を作る
 * （使い回すと `matchAll` の開始位置がずれて抽出が静かに壊れる）。
 */
function globalRegExp(source: string): RegExp {
  return new RegExp(source, "gu");
}

/** 操作列のクラス集合。並び順に依存しない。 */
const ACTION_CLASS_LOOKAHEAD =
  /(?=(?:[^\s]*\s)*flex(?:\s|$))(?=(?:[^\s]*\s)*gap-2(?:\s|$))/u;

/**
 * `className` リテラル、または `cn()` の文字列引数を結合した値。
 * 変数引数は見えない。
 */
function classNameAttr(
  tag: string,
): { raw: string; classes: string } | undefined {
  const cn = /className=\{cn\(([^)]*)\)\}?/u.exec(tag);
  if (cn) {
    const args = cn[1] ?? "";
    const literals = [...args.matchAll(/["']([^"']*)["']/gu)].map(
      (match) => match[1] ?? "",
    );
    return { raw: `className={cn(${args})}`, classes: literals.join(" ") };
  }

  const literal = /className=\{?"([^"]*)"/u.exec(tag);
  if (!literal) return undefined;
  return { raw: literal[0], classes: literal[1] ?? "" };
}

type DivKind = "open" | "close" | "self";

interface DivToken {
  readonly kind: DivKind;
  /** `<` の index。 */
  readonly start: number;
  /** 開始タグ終端 `>` の次の index。 */
  readonly after: number;
}

/**
 * 開始タグ終端 `>` の index を返す（見つからなければ -1）。
 *
 * JSX 式（`onClick={() => …}`）や属性文字列の中の `>` を終端と誤認しないよう、
 * 波括弧の深さと引用符を数える。単純な `indexOf(">")` だと `=>` で切れて
 * その後ろの `className` を取りこぼす（= 違反を無言で見逃す）。
 */
function findTagEnd(source: string, tagStart: number): number {
  let braces = 0;
  let quote: string | undefined;

  for (let index = tagStart; index < source.length; index += 1) {
    const char = source[index];

    if (quote !== undefined) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") {
      braces += 1;
      continue;
    }
    if (char === "}") {
      braces -= 1;
      continue;
    }
    if (char === ">" && braces === 0) return index;
  }

  return -1;
}

/**
 * `<div` / `</div>` / `<div … />` を出現順に返す。
 *
 * 自己閉じを開始タグと数えると深さが戻らず、ヘッダーブロックの抽出が
 * **無言で** 0 件になる（対応する `</div>` に到達しないため）。
 */
function divTokens(source: string): DivToken[] {
  const tokens: DivToken[] = [];

  for (const match of source.matchAll(globalRegExp(DIV_TOKEN_SOURCE))) {
    const end = findTagEnd(source, match.index);
    if (end === -1) continue;

    const isClose = match[0].startsWith("</");
    const isSelfClosing = !isClose && source[end - 1] === "/";

    tokens.push({
      kind: isClose ? "close" : isSelfClosing ? "self" : "open",
      start: match.index,
      after: end + 1,
    });
  }

  return tokens;
}

interface HeaderBlock {
  readonly hasH1: boolean;
  /** 直下（depth 1）の子 div の開始タグ。 */
  readonly childTags: readonly string[];
}

/** ヘッダーラッパーの `<div>` から対応する `</div>` までを切り出す。 */
function headerBlocks(source: string): HeaderBlock[] {
  const tokens = divTokens(source);
  const blocks: HeaderBlock[] = [];

  for (const [position, token] of tokens.entries()) {
    if (token.kind !== "open") continue;
    if (!HEADER_CLASS_LOOKAHEAD.test(source.slice(token.start, token.after))) {
      continue;
    }

    let depth = 1;
    let end = -1;
    const childTags: string[] = [];

    for (const inner of tokens.slice(position + 1)) {
      // 自己閉じ div は子を持たない = 折り返す対象が無いので操作列にならない。
      if (inner.kind === "self") continue;

      if (inner.kind === "close") {
        depth -= 1;
        if (depth === 0) {
          end = inner.start;
          break;
        }
        continue;
      }

      if (depth === 1) childTags.push(source.slice(inner.start, inner.after));
      depth += 1;
    }

    // 対応する `</div>` が見つからない = 抽出が壊れているので採用しない。
    if (end === -1) continue;

    blocks.push({
      hasH1: source.slice(token.after, end).includes("<h1"),
      childTags,
    });
  }

  return blocks;
}

export interface HeaderActionScan {
  /** `<h1>` を持つ = 検査対象になったヘッダーの数。 */
  readonly headerCount: number;
  /** `${file}: ${className}` 形式の違反。 */
  readonly violations: readonly string[];
}

/**
 * 判定の本体。実走査も fixture もこの 1 つだけを呼ぶ。
 *
 * ファイル読み込みは**必須引数**で受ける（既定値を置くと、その既定を通るのは
 * 実走査だけになり fixture が配線を検証しなくなる）。
 */
export function scanHeaderActionRows(
  files: readonly string[],
  readSource: (file: string) => string,
): HeaderActionScan {
  const violations: string[] = [];
  let headerCount = 0;

  for (const file of files) {
    for (const block of headerBlocks(readSource(file))) {
      // filter bar / loading skeleton など h1 を伴わないレイアウトは対象外。
      if (!block.hasH1) continue;
      headerCount += 1;

      for (const tag of block.childTags) {
        const actionRow = classNameAttr(tag);
        if (!actionRow) continue;
        if (!ACTION_CLASS_LOOKAHEAD.test(actionRow.classes)) continue;
        if (actionRow.classes.includes("flex-wrap")) continue;
        violations.push(`${file}: ${actionRow.raw}`);
      }
    }
  }

  return { headerCount, violations };
}

function listAdminDashboardFiles(): string[] {
  return [...new Glob(ADMIN_DASHBOARD_GLOB).scanSync(process.cwd())]
    .map((path) => path.split(sep).join("/"))
    .sort();
}

function readAdminSource(file: string): string {
  return readFileSync(join(process.cwd(), ...file.split("/")), "utf8");
}

const HEADER_OPEN = `<div className="${HEADER_CLASSNAME} sm:justify-between">`;

function scanFixture(
  sources: Readonly<Record<string, string>>,
): HeaderActionScan {
  return scanHeaderActionRows(
    Object.keys(sources),
    (file) => sources[file] ?? "",
  );
}

describe("admin ページヘッダーの操作列は折り返す", () => {
  test("h1 を持つヘッダー直下の flex gap-2 行に flex-wrap がある", () => {
    const { violations } = scanHeaderActionRows(
      listAdminDashboardFiles(),
      readAdminSource,
    );

    expect(violations).toEqual([]);
  });

  test("検査対象のヘッダーが実在する（走査が空振りしていない）", () => {
    const { headerCount } = scanHeaderActionRows(
      listAdminDashboardFiles(),
      readAdminSource,
    );

    // house pattern が消えたり、ブロック抽出が壊れたりすると gate が無言で
    // 無効化されるので下限を張る（実測 19 箇所）。
    expect(headerCount).toBeGreaterThanOrEqual(15);
  });
});

describe("gate の判定（fixture）", () => {
  test("ヘッダー直下の未対応な操作列を落とす", () => {
    const scan = scanFixture({
      "events/page.tsx": `
        ${HEADER_OPEN}
          <div>
            <h1 className="text-2xl font-bold">イベント</h1>
            <p className="text-sm">イベントの管理</p>
          </div>
          <div className="flex gap-2">
            <Button>新規作成</Button>
          </div>
        </div>`,
    });

    expect(scan.violations).toEqual([
      'events/page.tsx: className="flex gap-2"',
    ]);
    expect(scan.headerCount).toBe(1);
  });

  test("先頭が折り返し済みでも後続の未対応な列を落とす", () => {
    const scan = scanFixture({
      "posts/page.tsx": `
        ${HEADER_OPEN}
          <div><h1>記事</h1></div>
          <div className="flex flex-wrap gap-2"><Button>下書き</Button></div>
          <div className="flex items-center gap-2"><Button>新規作成</Button></div>
        </div>`,
    });

    expect(scan.violations).toEqual([
      'posts/page.tsx: className="flex items-center gap-2"',
    ]);
  });

  test("クラスの並び順が違っても落とす", () => {
    const scan = scanFixture({
      "terms/page.tsx": `
        ${HEADER_OPEN}
          <div><h1>規約</h1></div>
          <div className="items-center gap-2 flex"><Button>新規作成</Button></div>
        </div>`,
    });

    expect(scan.violations).toEqual([
      'terms/page.tsx: className="items-center gap-2 flex"',
    ]);
  });

  test("開始タグ内の JSX 式（=>）で className を取りこぼさない", () => {
    const scan = scanFixture({
      "pages/page.tsx": `
        ${HEADER_OPEN}
          <div><h1>ページ</h1></div>
          <div onClick={() => setOpen(true)} className="flex gap-2">
            <Button>新規作成</Button>
          </div>
        </div>`,
    });

    expect(scan.violations).toEqual(['pages/page.tsx: className="flex gap-2"']);
  });

  test("自己閉じ div があってもブロック抽出が壊れない", () => {
    const scan = scanFixture({
      "customers/page.tsx": `
        <div className="space-y-6">
          ${HEADER_OPEN}
            <div className="space-y-2">
              <h1>顧客</h1>
              <div className="h-1 w-8 rounded bg-primary" />
            </div>
            <div className="flex gap-2"><Button>新規作成</Button></div>
          </div>
          <div className="flex gap-2 pt-4">ページ送り</div>
        </div>`,
    });

    // ヘッダー内の 1 件だけ。ブロック外のページ送りは拾わない。
    // 自己閉じを開始タグと数えると深さが戻らず、ヘッダーの操作列を取りこぼして
    // ブロック外のページ送りを直下の子と誤認する（className を別にして区別する）。
    expect(scan.violations).toEqual([
      'customers/page.tsx: className="flex gap-2"',
    ]);
  });

  test("flex-wrap 済みの操作列は通す", () => {
    const scan = scanFixture({
      "media/page.tsx": `
        ${HEADER_OPEN}
          <div><h1>メディア</h1></div>
          <div className="flex flex-wrap gap-2"><Button>アップロード</Button></div>
        </div>`,
    });

    expect(scan.violations).toEqual([]);
    expect(scan.headerCount).toBe(1);
  });

  test("h1 を持たない filter bar は対象外", () => {
    const scan = scanFixture({
      "event-categories/_components/CategoryFilters.tsx": `
        <div className="${HEADER_CLASSNAME}">
          <div className="flex items-center gap-2">
            <Checkbox id="includeInactive" />
            <Label htmlFor="includeInactive">非アクティブを含める</Label>
          </div>
          <div className="flex-1"><Input type="search" /></div>
        </div>`,
    });

    expect(scan.violations).toEqual([]);
    expect(scan.headerCount).toBe(0);
  });

  test("h1 を持たない loading skeleton の後続 pagination を拾わない", () => {
    const scan = scanFixture({
      "media/loading.tsx": `
        <div className="space-y-6" aria-busy="true">
          ${HEADER_OPEN}
            <div className="space-y-2"><Skeleton className="h-8 w-48" /></div>
            <Skeleton className="h-11 w-32" />
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <div className="flex gap-2"><Skeleton className="h-11 w-11" /></div>
          </div>
        </div>`,
    });

    expect(scan.violations).toEqual([]);
    expect(scan.headerCount).toBe(0);
  });

  test("孫要素の flex gap-2 は操作列にしない", () => {
    const scan = scanFixture({
      "spaces/page.tsx": `
        ${HEADER_OPEN}
          <div>
            <h1>スペース</h1>
            <div className="flex gap-2"><Badge>公開中</Badge></div>
          </div>
          <div className="flex flex-wrap gap-2"><Button>新規作成</Button></div>
        </div>`,
    });

    expect(scan.violations).toEqual([]);
  });

  test("ヘッダーブロックの外にある列は拾わない", () => {
    const scan = scanFixture({
      "reservations/page.tsx": `
        <div className="space-y-6">
          ${HEADER_OPEN}
            <div><h1>予約</h1></div>
            <div className="flex flex-wrap gap-2"><Button>新規作成</Button></div>
          </div>
          <div className="flex items-center justify-between">
            <p>1-20 / 120</p>
            <div className="flex gap-2"><Button>前へ</Button><Button>次へ</Button></div>
          </div>
        </div>`,
    });

    expect(scan.violations).toEqual([]);
  });

  test("並び順が違うヘッダーも母集合に入れて未対応な操作列を落とす", () => {
    const scan = scanFixture({
      "faq/page.tsx": `
        <div className="flex flex-col gap-4 sm:items-center sm:flex-row sm:justify-between">
          <div><h1>FAQ</h1></div>
          <div className="flex gap-2"><Button>新規作成</Button></div>
        </div>`,
    });

    expect(scan.violations).toEqual(['faq/page.tsx: className="flex gap-2"']);
    expect(scan.headerCount).toBe(1);
  });

  test("cn() で組んだ操作列も落とす", () => {
    const scan = scanFixture({
      "inquiries/page.tsx": `
        ${HEADER_OPEN}
          <div><h1>問い合わせ</h1></div>
          <div className={cn("flex gap-2")}><Button>新規作成</Button></div>
        </div>`,
    });

    expect(scan.violations).toEqual([
      'inquiries/page.tsx: className={cn("flex gap-2")}',
    ]);
    expect(scan.headerCount).toBe(1);
  });
});
