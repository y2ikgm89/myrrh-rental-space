/**
 * `isPrismaUniqueConstraintError(error, "Model.field")` の第 2 引数が
 * schema.prisma に実在する **モデル修飾付き** field であることを突き合わせる。
 *
 * ## なぜ要るのか
 *
 * この引数は **DB のエラーメタデータと突き合わせる文字列**で、型検査が一切効かない。
 * 綴りを間違えても、field を消しても、物理列名を変えても、コンパイルは通り
 * **判定が黙って常に false になる**。false になった先は「P2002 を握り潰して
 * idempotent に扱う」経路なので、握り潰しが止まって throw に変わる。
 *
 * 実害の記録: 物理列名を snake_case へ寄せたとき、
 * adapter-pg が返す `constraint.fields` が `stripe_refund_id` になったのに
 * 呼び出し側は `"stripeRefundId"` のままだった。返金の冪等性チェック 2 本
 * （`payment-claim-orchestration.ts` / `stripe-refund-orchestration.ts`）が
 * 常に false を返す状態になり、**Stripe の webhook 再送が無限リトライになる**。
 *
 * ## 過去の vacuous 欠陥（今回潰す）
 *
 * 1. `collectColumns()` が field 名だけで畳み、同名列が複数モデルにあると後勝ち
 * 2. 正規表現が「第 2 引数が StringLiteral」の形しか拾わず、定数・変数・改行を
 *    **無言で母集団から落とす** → 未知 field ゼロで緑
 *
 * AST で CallExpression を拾い、第 2 引数が StringLiteral でないものは違反。
 * キーは `Model.field`。物理名一致は helper の snake_case 前提と突合する。
 *
 * ## helper が持つ index 名の表も突き合わせる
 *
 * adapter-pg 7.10.0 は unique 違反で **index 名**（`refunds_stripe_refund_id_key`）
 * だけを返し、列名を一切載せない。runtime から schema.prisma は読めないので、
 * helper は `Model.field` → index 名の表を持つ。**表は schema.prisma の写しなので、
 * 写した瞬間からずれ始める。** ここで両者を突き合わせて、ずれたら落とす。
 *
 * 期待する index 名の導出は Prisma の命名規則そのもの:
 * `@id` なら `<テーブル名>_pkey`、`@@unique(..., map: "X")` なら `X`、
 * それ以外は `<テーブル名>_<物理列名>_key`。
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  createSourceFile,
  forEachChild,
  isCallExpression,
  isIdentifier,
  isStringLiteral,
  ScriptKind,
  ScriptTarget,
  type Node,
} from "typescript";

import { readPrismaSchema } from "../../support/prisma-sources";

const ROOT = join(import.meta.dir, "../../..");
const SRC = join(ROOT, "src");

const SCALAR_TYPES = new Set([
  "String",
  "Int",
  "BigInt",
  "Float",
  "Decimal",
  "Boolean",
  "DateTime",
  "Json",
  "Bytes",
]);

function walkFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(path);
    return /\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}

function toSnakeCase(name: string): string {
  return name.replaceAll(/(?<!^)(?=[A-Z])/gu, "_").toLowerCase();
}

const schema = readPrismaSchema();

/** `Model.field` → 物理列名。同名 field でもモデルが違えば別エントリ。 */
function collectColumns(): Map<string, string> {
  const modelNames = new Set(
    [...schema.matchAll(/^model (\w+) \{/gmu)].map((m) => m[1] ?? ""),
  );
  const enumNames = new Set(
    [...schema.matchAll(/^enum (\w+) \{/gmu)].map((m) => m[1] ?? ""),
  );
  const out = new Map<string, string>();

  for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gmu)) {
    const model = match[1];
    const body = match[2];
    if (model === undefined || body === undefined) continue;
    for (const line of body.split(/\r?\n/u)) {
      const column = /^ {2}(\w+)\s+(\w+)/u.exec(line);
      if (!column) continue;
      const [, field, type] = column;
      if (field === undefined || type === undefined) continue;
      if (modelNames.has(type)) continue;
      if (!SCALAR_TYPES.has(type) && !enumNames.has(type)) continue;
      out.set(
        `${model}.${field}`,
        /@map\("([^"]+)"\)/u.exec(line)?.[1] ?? field,
      );
    }
  }
  return out;
}

const columns = collectColumns();

/**
 * `Model.field` → Prisma が実際に作る unique index 名。
 *
 * 単一 field の一意性だけを対象にする（helper が判定できるのもそこだけ）。
 * 複合 unique は index 名から特定の field を導けないので入れない。
 */
function collectUniqueIndexNames(): Map<string, string> {
  const out = new Map<string, string>();

  for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gmu)) {
    const model = match[1];
    const body = match[2];
    if (model === undefined || body === undefined) continue;

    const table = /@@map\("([^"]+)"\)/u.exec(body)?.[1] ?? model;

    for (const line of body.split(/\r?\n/u)) {
      const declaration = /^ {2}(\w+)\s+\w+/u.exec(line);
      if (!declaration) continue;
      const field = declaration[1];
      if (field === undefined) continue;
      const column = /@map\("([^"]+)"\)/u.exec(line)?.[1] ?? field;
      if (/@id\b/u.test(line)) out.set(`${model}.${field}`, `${table}_pkey`);
      else if (/@unique\b/u.test(line)) {
        out.set(`${model}.${field}`, `${table}_${column}_key`);
      }
    }

    // `@@unique([field])` / `@@unique([field], map: "name", ...)` の単一 field 形。
    for (const block of body.matchAll(/@@unique\(\[(\w+)\]([^\n]*)/gu)) {
      const field = block[1];
      const rest = block[2] ?? "";
      if (field === undefined) continue;
      const column = columns.get(`${model}.${field}`) ?? toSnakeCase(field);
      out.set(
        `${model}.${field}`,
        /map:\s*"([^"]+)"/u.exec(rest)?.[1] ?? `${table}_${column}_key`,
      );
    }
  }
  return out;
}

const uniqueIndexNames = collectUniqueIndexNames();

/**
 * helper が持つ `Model.field` → index 名の表。**リテラルのまま**読む
 * （計算式に変えられたら 0 件になり、下の下限 assert が落ちる）。
 */
function readHelperIndexTable(): Map<string, string> {
  const source = readFileSync(join(SRC, "shared/lib/prisma-errors.ts"), "utf8");
  const start = source.indexOf("const UNIQUE_INDEX_BY_TARGET_FIELD");
  if (start === -1) return new Map();
  const end = source.indexOf("};", start);
  if (end === -1) return new Map();
  const body = source.slice(start, end);
  return new Map(
    [...body.matchAll(/"([\w.]+)":\s*"([\w]+)"/gu)].map(([, key, value]) => [
      key ?? "",
      value ?? "",
    ]),
  );
}

const helperIndexTable = readHelperIndexTable();

type CallSite =
  | {
      readonly kind: "literal";
      readonly file: string;
      readonly target: string;
    }
  | {
      readonly kind: "unresolved";
      readonly file: string;
    };

/** この名前を本文に持たないファイルは、呼び出しを持ちようがない。 */
const CALLEE = "isPrismaUniqueConstraintError";

function collectCallSites(file: string): CallSite[] {
  const text = readFileSync(file, "utf8");

  // 呼出名が無いファイルは parse しない。**取りこぼしは起きない** — 下の visit は
  // `node.expression.text === CALLEE` で判定するので、対象呼出はソースにこの名前が
  // 必ず現れる。全 src を AST にすると CI で 5 秒の既定 per-test timeout に迫る
  // （同型の `cache-tag-literals` は実際に超えて落ちた）。
  if (!text.includes(CALLEE)) return [];

  const source = createSourceFile(
    file,
    text,
    ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ScriptKind.TSX : ScriptKind.TS,
  );
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  const out: CallSite[] = [];

  const visit = (node: Node): void => {
    if (
      isCallExpression(node) &&
      isIdentifier(node.expression) &&
      node.expression.text === CALLEE
    ) {
      const targetArg = node.arguments[1];
      if (targetArg === undefined) {
        // targetField 省略は任意 unique 検出。gate 対象外。
      } else if (isStringLiteral(targetArg)) {
        out.push({ kind: "literal", file: rel, target: targetArg.text });
      } else {
        out.push({ kind: "unresolved", file: rel });
      }
    }
    forEachChild(node, visit);
  };
  forEachChild(source, visit);
  return out;
}

const callSites = walkFiles(SRC).flatMap(collectCallSites);
const literalSites = callSites.filter(
  (site): site is Extract<CallSite, { kind: "literal" }> =>
    site.kind === "literal",
);
const unresolvedSites = callSites.filter((site) => site.kind === "unresolved");

describe("isPrismaUniqueConstraintError の target field", () => {
  test("走査が空振りしていない", () => {
    expect(callSites.length).toBeGreaterThan(5);
    expect(columns.size).toBeGreaterThan(300);
    expect(uniqueIndexNames.size).toBeGreaterThan(60);
    expect(helperIndexTable.size).toBeGreaterThan(5);
  });

  test("AST で見つけた呼び出しはすべて StringLiteral 第 2 引数に解決できる", () => {
    // 定数・変数・テンプレは母集団から黙って消えない。等式で vacuous を防ぐ。
    expect(callSites.length).toBe(literalSites.length);
    expect(unresolvedSites).toEqual([]);
  });

  test("すべて Model.field 形式で schema.prisma に実在する", () => {
    const unknown = literalSites
      .filter((site) => !columns.has(site.target))
      .map(
        (site) =>
          `${site.file}: "${site.target}" は schema.prisma に無い（Model.field 必須）`,
      );
    expect(unknown).toEqual([]);
  });

  test("呼び出し側の Model.field はすべて helper の index 表に載っている", () => {
    // 載っていない target は helper が問答無用で false を返す = 握り潰しが止まる。
    const missing = literalSites
      .filter((site) => !helperIndexTable.has(site.target))
      .map(
        (site) =>
          `${site.file}: "${site.target}" が UNIQUE_INDEX_BY_TARGET_FIELD に無い`,
      );
    expect(missing).toEqual([]);
  });

  test("index 表の各行が schema.prisma の宣言と一致する", () => {
    const mismatched = [...helperIndexTable].flatMap(([target, index]) => {
      const expected = uniqueIndexNames.get(target);
      if (expected === undefined) {
        return [
          `"${target}" は schema.prisma に単一 field の unique 宣言が無い`,
        ];
      }
      if (expected !== index) {
        return [`"${target}" の index 名は "${expected}" だが表は "${index}"`];
      }
      return [];
    });
    expect(mismatched).toEqual([]);
  });

  test("index 表に使われていない行を残さない", () => {
    // 呼び出しが消えた行を残すと、schema 側の改名に気づけない死んだ写しになる。
    const targets = new Set(literalSites.map((site) => site.target));
    const unused = [...helperIndexTable.keys()].filter(
      (target) => !targets.has(target),
    );
    expect(unused).toEqual([]);
  });

  test("物理列名が field 名の snake_case と一致する（helper の変換前提）", () => {
    const mismatched = literalSites
      .filter((site) => {
        const physical = columns.get(site.target);
        const field = site.target.split(".")[1];
        return (
          physical !== undefined &&
          field !== undefined &&
          physical !== toSnakeCase(field)
        );
      })
      .map((site) => {
        const field = site.target.split(".")[1] ?? "";
        return (
          `${site.file}: "${site.target}" の物理名は "${columns.get(site.target)}" で、` +
          `snake_case("${field}") = "${toSnakeCase(field)}" と一致しない`
        );
      });
    expect(mismatched).toEqual([]);
  });
});
