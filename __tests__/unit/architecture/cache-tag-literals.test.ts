/**
 * cache tag invalidation は `CACHE_TAGS` / `getCacheTag` を経由し、
 * タグ文字列を直書きしない。
 *
 * ## なぜ要るのか
 *
 * `cacheTag` / `updateTag` / `revalidateTag` にタグ文字列を直書きすると、
 * `src/shared/lib/constants/cache.ts` の `CACHE_TAGS` / `getCacheTag` を改名・
 * 再構成したときに文字列だけが drift し、`'use cache'` producer とタグが
 * サイレントに食い違う（producer が新タグを出しているのに invalidation が
 * 旧タグを叩き続け、キャッシュが永久に stale になる）。
 *
 * ## 旧 gate との違い（架空の緑を止める）
 *
 * 旧 `architecture-boundaries.test.ts` 版は 1 行の regex
 * `\b(?:cacheTag|updateTag|revalidateTag)\(\s*["'][^"']+["']` だった。これは
 * 2 つの穴を持つ:
 *
 * 1. **テンプレートリテラルを一切見ない。** `` cacheTag(`spaces-${id}`) `` は
 *    バッククォートなので `["'][^"']+["']` にマッチせず、無条件で通る。
 * 2. **呼出が複数行に折れると見逃す。** `cacheTag(\n  "literal"\n)` のように
 *    開き括弧と文字列リテラルが同じ行にないと regex は光らない。
 *
 * 新 gate は TypeScript AST で `cacheTag` / `updateTag` / `revalidateTag` の
 * `CallExpression` を全部見つけ、各引数が `StringLiteral` /
 * `NoSubstitutionTemplateLiteral` / `TemplateExpression` のときだけ判定する
 * （他の式形 — identifier・property access・関数呼出 — は SSoT 経由である
 * 可能性を否定できないため対象外。`src/shared/lib/cache/site-wide.ts` の
 * `for (const tag of nextJsTags) updateTag(tag)` のように、ループ変数越しに
 * `CACHE_TAGS` 由来の値を渡す形は引き続き許可する）。
 *
 * ## この gate が証明すること / しないこと
 *
 * **証明する**: `cacheTag` / `updateTag` / `revalidateTag` に渡す文字列 /
 * テンプレートリテラル引数が、必ず `CACHE_TAGS` または `getCacheTag` を経由
 * していること（テンプレートリテラルは補間式のどこかに `CACHE_TAGS` /
 * `getCacheTag` ルートの識別子が現れること）。
 *
 * **証明しない**: identifier 経由で渡された値が実際に `CACHE_TAGS` /
 * `getCacheTag` から来ていること（データフロー解析はしない）。
 */

import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";
import {
  ScriptKind,
  ScriptTarget,
  SyntaxKind,
  createSourceFile,
  forEachChild,
  isCallExpression,
  isIdentifier,
  isStringLiteralLike,
  isTemplateExpression,
  type Expression,
  type Node,
} from "typescript";

import { collectSourceFiles } from "../../helpers/architecture-fs";

const ROOT = process.cwd();
const SRC_ROOT = join(ROOT, "src");
const CACHE_CONSTANTS_FILE = join(
  SRC_ROOT,
  "shared",
  "lib",
  "constants",
  "cache.ts",
);

const TARGET_FUNCTION_NAMES = new Set([
  "cacheTag",
  "updateTag",
  "revalidateTag",
]);

const SSOT_ROOTS = new Set(["CACHE_TAGS", "getCacheTag"]);

interface Violation {
  readonly file: string;
  readonly callee: string;
  readonly argumentText: string;
}

/** fixture 用の疑似ファイル内容（`analyzeSnippet` だけが書き込む）。 */
const FIXTURE = new Map<string, string>();

function sourceFiles(): string[] {
  return collectSourceFiles(SRC_ROOT).filter(
    (file) => file !== CACHE_CONSTANTS_FILE,
  );
}

/** 式のどこかに `CACHE_TAGS` / `getCacheTag` ルートの identifier があるか。 */
function referencesCacheSsot(node: Node): boolean {
  let found = false;
  const walk = (current: Node): void => {
    if (found) return;
    if (isIdentifier(current) && SSOT_ROOTS.has(current.text)) {
      found = true;
      return;
    }
    forEachChild(current, walk);
  };
  walk(node);
  return found;
}

/** 引数 1 つを判定する。violation なら true。 */
function isLiteralViolation(arg: Expression): boolean {
  if (isStringLiteralLike(arg)) {
    // `StringLiteral` は `SSOT_ROOTS` を含む可能性がゼロなので常に violation。
    // （`NoSubstitutionTemplateLiteral` も `isStringLiteralLike` に含まれる。）
    return true;
  }
  if (isTemplateExpression(arg)) {
    return !referencesCacheSsot(arg);
  }
  return false;
}

function collect(file: string): Violation[] {
  const text = FIXTURE.get(file) ?? readFileSync(file, "utf8");
  const source = createSourceFile(
    file,
    text,
    ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ScriptKind.TSX : ScriptKind.TS,
  );

  const out: Violation[] = [];
  let scannedCalls = 0;

  const walk = (node: Node): void => {
    if (
      isCallExpression(node) &&
      isIdentifier(node.expression) &&
      TARGET_FUNCTION_NAMES.has(node.expression.text)
    ) {
      scannedCalls += 1;
      for (const arg of node.arguments) {
        if (isLiteralViolation(arg)) {
          out.push({
            file: relative(ROOT, file).replaceAll("\\", "/"),
            callee: node.expression.text,
            argumentText: arg.getText(source),
          });
        }
      }
    }
    forEachChild(node, walk);
  };
  forEachChild(source, walk);

  collectCallCounter.count += scannedCalls;
  return out;
}

/** module-level のスキャン数集計（sanity: 母集合が空振りしていないことの証明用）。 */
const collectCallCounter = { count: 0 };

/**
 * fixture を **本番と同じ解析器**へ通す。
 *
 * gate 自身が「通してはいけないものを本当に落とすか」を毎回証明するために要る。
 * 別実装で確かめると、gate が壊れても fixture だけ緑になる。
 */
function analyzeSnippet(code: string): Violation[] {
  const path = join(ROOT, "__gate_fixture__.ts");
  const original = FIXTURE.get(path);
  FIXTURE.set(path, code);
  const before = collectCallCounter.count;
  try {
    return collect(path).map((v) => ({ ...v, file: "fixture.ts" }));
  } finally {
    collectCallCounter.count = before;
    if (original === undefined) FIXTURE.delete(path);
    else FIXTURE.set(path, original);
  }
}

describe("cache tag invalidation は CACHE_TAGS / getCacheTag を経由し、タグ文字列を直書きしない", () => {
  test("走査対象と母集合が空でない（gate 自体が空振りしていない）", () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(500);
    expect(files.includes(CACHE_CONSTANTS_FILE)).toBe(false);
  });

  test("通ってはいけない書き方が実際に落ちる（fixture）", () => {
    // 単純な文字列リテラル。
    expect(analyzeSnippet(`cacheTag("spaces");`)).toEqual([
      { file: "fixture.ts", callee: "cacheTag", argumentText: '"spaces"' },
    ]);
    // シングルクォートでも同じ。
    expect(analyzeSnippet(`updateTag('reservations');`)).toEqual([
      {
        file: "fixture.ts",
        callee: "updateTag",
        argumentText: "'reservations'",
      },
    ]);
    // バッククォートのテンプレートリテラル（旧 regex が見逃していた形）。
    expect(analyzeSnippet("cacheTag(`spaces-${id}`);")).toEqual([
      {
        file: "fixture.ts",
        callee: "cacheTag",
        argumentText: "`spaces-${id}`",
      },
    ]);
    // 補間なしのテンプレートリテラル。
    expect(analyzeSnippet("revalidateTag(`reservations`);")).toEqual([
      {
        file: "fixture.ts",
        callee: "revalidateTag",
        argumentText: "`reservations`",
      },
    ]);
    // 複数行呼出（旧 regex が見逃していた形: 開き括弧と文字列リテラルが別行）。
    expect(
      analyzeSnippet(`cacheTag(
        "spaces"
      );`),
    ).toEqual([
      { file: "fixture.ts", callee: "cacheTag", argumentText: '"spaces"' },
    ]);
  });

  test("通ってよい書き方は落ちない（fixture）", () => {
    expect(analyzeSnippet(`cacheTag(CACHE_TAGS.SPACES);`)).toEqual([]);
    expect(analyzeSnippet(`cacheTag(getCacheTag.spaces.detail(id));`)).toEqual(
      [],
    );
    // テンプレートリテラルの補間に CACHE_TAGS が現れれば許可。
    expect(analyzeSnippet("cacheTag(`${CACHE_TAGS.SPACES}-${id}`);")).toEqual(
      [],
    );
    // getCacheTag.x.y(...) を補間しても許可。
    expect(
      analyzeSnippet("updateTag(`${getCacheTag.spaces.detail(id)}`);"),
    ).toEqual([]);
    // 関数呼出結果を渡す形 (SPACE_RATE_PLANS は spaceId-keyed producer)。
    expect(
      analyzeSnippet(`cacheTag(CACHE_TAGS.SPACE_RATE_PLANS(spaceId));`),
    ).toEqual([]);
    // ループ変数越しに CACHE_TAGS 由来の値を渡す形（site-wide.ts の実パターン）。
    expect(
      analyzeSnippet(`for (const tag of nextJsTags) updateTag(tag);`),
    ).toEqual([]);
    // 複数引数（CACHE_TAGS + getCacheTag 併用）。
    expect(
      analyzeSnippet(
        `cacheTag(CACHE_TAGS.POSTS, getCacheTag.posts.detail(slug));`,
      ),
    ).toEqual([]);
  });

  test("src に cacheTag/updateTag/revalidateTag のタグ文字列直書きが無い", () => {
    collectCallCounter.count = 0;
    const offenders = sourceFiles().flatMap((file) => collect(file));

    // sanity: スキャンした呼出自体が 0 件だと gate が空振りする。
    expect(collectCallCounter.count).toBeGreaterThan(50);

    expect({
      offenders: offenders.map(
        (o) => `${o.file} :: ${o.callee}(${o.argumentText})`,
      ),
      hint:
        offenders.length > 0
          ? "cacheTag/updateTag/revalidateTag のタグは CACHE_TAGS.<NAME> または getCacheTag.<domain>.<fn>(...) を経由すること。文字列/テンプレートリテラルの直書きは producer とのタグ drift を静的検出できなくする。"
          : "",
    }).toEqual({ offenders: [], hint: "" });
  });
});
