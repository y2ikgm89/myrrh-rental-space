/**
 * domain 層の Prisma shape const は `satisfies Prisma.<Model><Kind>` を必須にする。
 *
 * ## なぜゲートが要るのか
 *
 * `select` / `where` / `include` のオブジェクトリテラルは、型注釈が無いと
 * **存在しないフィールドを書いても tsc が通る**。実行時に Prisma が
 * `Unknown field` で落ちるまで誰も気付かない。
 *
 * 実例: `STATUS_HISTORY_SELECT` が `changedBy`（`InquiryStatusHistory` に存在しない
 * リレーション）を select しており、管理画面の問い合わせ詳細は**必ず 500 だった**。
 * `satisfies` を付けた瞬間 `TS2561: 'changedBy' does not exist in type
 * 'InquiryStatusHistorySelect'` になる（PR #1909 で実測）。
 *
 * ## 判定
 *
 * 名前に `Select` / `Where` / `Include`（大文字小文字・SCREAMING_SNAKE 含む）を持つ
 * module-level / 関数ローカルの `const X = {` を対象にし、その閉じ行が `satisfies Prisma.` を
 * 含むことを要求する。`as const satisfies Prisma.X` でも `satisfies Prisma.X` でもよい。
 *
 * **`as const` を外さないこと。** `as const` 無しの `satisfies` は `{ id: true }` を
 * `{ id: boolean }` に推論し、`typeof CONST` を `GetPayload` に渡している箇所で
 * 「どのフィールドを選んだか」が失われて戻り値が index signature に潰れる
 * （実測: 341 件の TS4111 / TS2339 が下流で発生した）。
 *
 * 免除は置かない。対象は機械的に列挙できるうえ、例外を認める理由が無い。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const DOMAIN_ROOT = join(process.cwd(), "src", "shared", "domain");

/** shape const 名: Select / Where / Include を**部分文字列**として含む（単体の `where` は除外）。 */
const SHAPE_NAME =
  "[A-Za-z0-9_]*(?:[Ss]elect|SELECT|[Ww]here|WHERE|[Ii]nclude|INCLUDE)[A-Za-z0-9_]+|[A-Za-z0-9_]+(?:[Ss]elect|SELECT|[Ww]here|WHERE|[Ii]nclude|INCLUDE)[A-Za-z0-9_]*";

/** 複数行の shape const 宣言（先頭に空白可）。 */
const MULTILINE_SHAPE_CONST = new RegExp(
  `^[ \\t]*(?:export )?const (${SHAPE_NAME}) = \\{[ \\t]*\\r?$`,
  "gmu",
);

/** 1 行完結の shape const（satisfies の有無は問わず検出）。 */
const ONE_LINE_SHAPE_CONST = new RegExp(
  `^[ \\t]*(?:export )?const (${SHAPE_NAME}) = \\{[\\s\\S]*?\\}[ \\t]*(?:as const[ \\t]*)?(?:satisfies Prisma\\.[^;]+)?;[ \\t]*\\r?$`,
  "gmu",
);

function listTypeScriptFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listTypeScriptFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

type ShapeConst = {
  readonly file: string;
  readonly name: string;
  readonly closing: string;
  readonly scope: "module" | "local";
};

function declIndent(line: string): string {
  return /^[ \t]*/u.exec(line)?.[0] ?? "";
}

/**
 * 宣言から**同じインデントで閉じる行**までを 1 つの const と見なす。
 * 入れ子オブジェクトは必ず深いインデントなので、浅い `}` だけを拾う。
 */
function collectShapeConsts(file: string): ShapeConst[] {
  const source = readFileSync(file, "utf8");
  const lines = source.split(/\r?\n/u);
  const found: ShapeConst[] = [];
  const seenAt = new Set<number>();

  for (const match of source.matchAll(MULTILINE_SHAPE_CONST)) {
    const name = match[1];
    if (name === undefined || match.index === undefined) continue;
    seenAt.add(match.index);
    const declLine = source.slice(0, match.index).split(/\r?\n/u).length - 1;
    const decl = lines[declLine] ?? "";
    const indent = declIndent(decl);
    const closing = lines
      .slice(declLine + 1)
      .find((line) => line.startsWith(`${indent}}`));
    found.push({
      file: file.replaceAll("\\", "/").split("src/shared/domain/")[1] ?? file,
      name,
      closing: closing ?? "(閉じ行が見つからない)",
      scope: indent.length === 0 ? "module" : "local",
    });
  }

  for (const match of source.matchAll(ONE_LINE_SHAPE_CONST)) {
    const name = match[1];
    if (name === undefined || match.index === undefined) continue;
    if (seenAt.has(match.index)) continue;
    const declLine = source.slice(0, match.index).split(/\r?\n/u).length - 1;
    const line = lines[declLine] ?? "";
    found.push({
      file: file.replaceAll("\\", "/").split("src/shared/domain/")[1] ?? file,
      name,
      closing: line.trim(),
      scope: declIndent(line).length === 0 ? "module" : "local",
    });
  }

  return found;
}

const shapeConsts =
  listTypeScriptFiles(DOMAIN_ROOT).flatMap(collectShapeConsts);

describe("domain の Prisma shape const", () => {
  test("対象が実在する（gate 自体が空振りしていない）", () => {
    const moduleLevel = shapeConsts.filter((c) => c.scope === "module").length;
    const local = shapeConsts.filter((c) => c.scope === "local").length;
    expect({ total: shapeConsts.length, moduleLevel, local }).toEqual({
      total: moduleLevel + local,
      // 2026-08-23: export の select を 3 本定数へ切り出した（監査 A-32）。
      // customers / reservations / events の `*_EXPORT_SELECT`。
      moduleLevel: 59,
      // 2026-08-14: sidebar/queries.ts の `publishedWhere` が
      // `publicPostsWhere()` の呼び出しに置き換わり、shape const ではなくなった
      // （監査 F-66）。ここは母集合の drift 検出なので実数に合わせる。
      local: 2,
    });
    expect(shapeConsts.length).toBeGreaterThan(50);
  });

  test("すべて satisfies Prisma.<型> を持つ", () => {
    const missing = shapeConsts
      .filter((c) => !c.closing.includes("satisfies Prisma."))
      .map((c) => `${c.file} :: ${c.name}  ->  ${c.closing.trim()}`);

    expect(missing).toEqual([]);
  });

  test("as const を持つものは as const satisfies の順序を保つ", () => {
    // `satisfies ... as const` は構文として書けないが、`as const` を落として
    // `satisfies` だけにする改変は通ってしまう。ここでは「元々 as const だったものが
    // 素の satisfies に退化していないか」ではなく、書き方が壊れていないことを見る。
    const broken = shapeConsts
      .filter((c) => c.closing.includes("as const"))
      .filter((c) => !/\}\s*as const satisfies Prisma\./u.test(c.closing))
      .map((c) => `${c.file} :: ${c.name}  ->  ${c.closing.trim()}`);

    expect(broken).toEqual([]);
  });
});
