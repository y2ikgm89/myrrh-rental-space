/**
 * `isPrismaUniqueConstraintError(error, "field")` の第 2 引数が実在する Prisma field で
 * あることを schema.prisma と突き合わせる。
 *
 * ## なぜ要るのか
 *
 * この引数は **DB のエラーメタデータと突き合わせる文字列**で、型検査が一切効かない。
 * 綴りを間違えても、field を消しても、物理列名を変えても、コンパイルは通り
 * **判定が黙って常に false になる**。false になった先は「P2002 を握り潰して
 * idempotent に扱う」経路なので、握り潰しが止まって throw に変わる。
 *
 * 実害の記録: 物理列名を snake_case へ寄せた 20260804110000〜20260804150000 で、
 * adapter-pg が返す `constraint.fields` が `stripe_refund_id` になったのに
 * 呼び出し側は `"stripeRefundId"` のままだった。返金の冪等性チェック 2 本
 * （`payment-claim-orchestration.ts` / `stripe-refund-orchestration.ts`）が
 * 常に false を返す状態になり、**Stripe の webhook 再送が無限リトライになる**。
 *
 * 当時の検査体制で捕まえられなかった理由:
 *
 * | 検査 | なぜ素通りしたか |
 * | --- | --- |
 * | 型検査 | 引数は `string`。何を渡しても通る |
 * | 生 SQL ゲート | SQL リテラルしか見ない。エラーメタデータ経路は対象外 |
 * | 単体テスト | fixture に `fields: ["stripeRefundId"]` と旧名を焼いていた |
 * | 統合テスト | 返金の重複 INSERT を実際に起こす経路が無かった |
 *
 * **「アプリ側は無変更で済む」という当時の判断が誤りだった**ことの再発防止として、
 * 物理名が絡む文字列引数を schema.prisma に結び付ける。
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { readPrismaSchema } from "../../support/prisma-sources";

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

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}

function toSnakeCase(name: string): string {
  return name.replaceAll(/(?<!^)(?=[A-Z])/gu, "_").toLowerCase();
}

const schema = readPrismaSchema();

/** field 名 → 物理列名。同名 field が複数モデルにあっても物理名は一致する規約。 */
function collectColumns(): Map<string, string> {
  const modelNames = new Set(
    [...schema.matchAll(/^model (\w+) \{/gmu)].map((m) => m[1] ?? ""),
  );
  const enumNames = new Set(
    [...schema.matchAll(/^enum (\w+) \{/gmu)].map((m) => m[1] ?? ""),
  );
  const out = new Map<string, string>();

  for (const match of schema.matchAll(/^model \w+ \{([\s\S]*?)^\}/gmu)) {
    const body = match[1];
    if (body === undefined) continue;
    for (const line of body.split(/\r?\n/u)) {
      const column = /^ {2}(\w+)\s+(\w+)/u.exec(line);
      if (!column) continue;
      const [, field, type] = column;
      if (field === undefined || type === undefined) continue;
      if (modelNames.has(type)) continue;
      if (!SCALAR_TYPES.has(type) && !enumNames.has(type)) continue;
      out.set(field, /@map\("([^"]+)"\)/u.exec(line)?.[1] ?? field);
    }
  }
  return out;
}

const columns = collectColumns();

/** `isPrismaUniqueConstraintError(x, "field")` のリテラル第 2 引数を拾う。 */
const CALL_WITH_LITERAL =
  /isPrismaUniqueConstraintError\(\s*[^,()]+,\s*"([^"]+)"\s*\)/gu;

type CallSite = { readonly file: string; readonly field: string };

const callSites: CallSite[] = walk("src").flatMap((file) =>
  [...readFileSync(file, "utf8").matchAll(CALL_WITH_LITERAL)]
    .map((m) => m[1])
    .filter((field): field is string => field !== undefined)
    .map((field) => ({ file: file.replaceAll("\\", "/"), field })),
);

describe("isPrismaUniqueConstraintError の target field", () => {
  test("走査が空振りしていない", () => {
    // 呼び出しを拾えなくなると違反ゼロで緑になる。
    // 実測: 呼び出し 8 箇所 / 全 970 列を field 名で畳んで 486 種。
    expect(callSites.length).toBeGreaterThan(5);
    expect(columns.size).toBeGreaterThan(300);
  });

  test("すべて schema.prisma に実在する field を指している", () => {
    const unknown = callSites
      .filter((site) => !columns.has(site.field))
      .map((site) => `${site.file}: "${site.field}" は schema.prisma に無い`);
    expect(unknown).toEqual([]);
  });

  test("物理列名が field 名の snake_case と一致する（helper の変換前提）", () => {
    // helper は adapter-pg が返す物理列名を `snake_case(field)` で復元する。
    // その前提が崩れた列を引数に取ると、判定が黙って false になる。
    const mismatched = callSites
      .filter((site) => {
        const physical = columns.get(site.field);
        return physical !== undefined && physical !== toSnakeCase(site.field);
      })
      .map(
        (site) =>
          `${site.file}: "${site.field}" の物理名は "${columns.get(site.field)}" で、` +
          `snake_case("${site.field}") = "${toSnakeCase(site.field)}" と一致しない`,
      );
    expect(mismatched).toEqual([]);
  });
});
