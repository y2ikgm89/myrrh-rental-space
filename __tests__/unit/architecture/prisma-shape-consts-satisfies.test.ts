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
 * module-level の `const X = {` を対象にし、その閉じ行が `satisfies Prisma.` を
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

/** 名前に Select / Where / Include を含む module-level const 宣言。 */
const SHAPE_CONST =
  /^(?:export )?const ([A-Za-z0-9_]*(?:[Ss]elect|SELECT|[Ww]here|WHERE|[Ii]nclude|INCLUDE)[A-Za-z0-9_]*) = \{[ \t]*\r?$/gmu;

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
};

/**
 * 宣言から**列 0 で閉じる行**までを 1 つの const と見なす。module-level の宣言だけを
 * 対象にしているので、入れ子のオブジェクトは必ずインデントされており誤検出しない。
 */
function collectShapeConsts(file: string): ShapeConst[] {
  const source = readFileSync(file, "utf8");
  const lines = source.split(/\r?\n/u);
  const found: ShapeConst[] = [];

  for (const match of source.matchAll(SHAPE_CONST)) {
    const name = match[1];
    if (name === undefined) continue;
    const declLine = source.slice(0, match.index).split(/\r?\n/u).length - 1;
    const closing = lines
      .slice(declLine + 1)
      .find((line) => line.startsWith("}"));
    found.push({
      file: file.replaceAll("\\", "/").split("src/shared/domain/")[1] ?? file,
      name,
      closing: closing ?? "(閉じ行が見つからない)",
    });
  }
  return found;
}

const shapeConsts =
  listTypeScriptFiles(DOMAIN_ROOT).flatMap(collectShapeConsts);

describe("domain の Prisma shape const", () => {
  test("対象が実在する（gate 自体が空振りしていない）", () => {
    // 検出数が 0 に落ちたら、命名規約が変わったか走査先が壊れている。
    expect(shapeConsts.length).toBeGreaterThan(40);
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
