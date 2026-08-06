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

function collectCallSites(file: string): CallSite[] {
  const text = readFileSync(file, "utf8");
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
      node.expression.text === "isPrismaUniqueConstraintError"
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
