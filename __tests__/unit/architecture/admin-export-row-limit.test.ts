/**
 * 管理画面 export は全 route が同じ行数上限を通る（監査 A-32）。
 *
 * ## なぜ
 *
 * 5 本のうち上限を持っていたのは 2 本だけで、しかもそれぞれ自前の定数
 * （`AUDIT_LOG_EXPORT_LIMIT` / `MAX_EXPORT_ROWS`）を持っていた。残り 3 本は
 * `take` も truncation も無く、`getCustomersForExport()` に至っては引数を 1 つも
 * 取らないので管理者が範囲を狭める手段が UI にも URL にも無かった。
 *
 * admin は `max_instance_count = 1` / `cpu = 1` / `memory = 1Gi`。`csv.ts` は
 * 行配列 → spread コピー → 巨大な単一文字列と増幅するので、ピークは CSV 実サイズの
 * 数倍になる。OOM は**唯一の admin インスタンス**を落とし、同時にログインしている
 * 全管理者が 503 を受ける。DB 側の壁は `statement_timeout` 15s で、その値のコメント
 * 自身が「正規の管理レポート／エクスポートより十分長い」と述べており、無制限 export は
 * その前提と矛盾する。
 *
 * ## 何を見るか
 *
 * `src/app/api/admin/export/` 配下の各 route が、上限超過を 409 で返す経路を持つこと。
 * 上限値そのものは `@/shared/domain/exports/limits` の `ADMIN_EXPORT_ROW_LIMIT` 1 箇所。
 *
 * **route が直接 `take` を書いているかは見ない。** 実際の `take` は domain query 側に
 * あり、route からは 409 の有無だけが観測できる。ここが粗いことは承知の上で、
 * 「新しい export route が上限なしで足される」ことは止められる。
 *
 * ## 直し方
 *
 * domain query を `ExportRowsResult<T>` 返しにして `take: ADMIN_EXPORT_ROW_LIMIT + 1`
 * を入れ、route は `truncated` のとき `EXPORT_TRUNCATED_MESSAGE` + `totalCount` を
 * 409 で返す。
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();
const EXPORT_ROOT = join(ROOT, "src", "app", "api", "admin", "export");

function exportRoutes(): string[] {
  return readdirSync(EXPORT_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** その route が上限超過を 409 で返す経路を持つか。 */
export function returnsTruncationConflict(source: string): boolean {
  return source.includes("status: 409") && source.includes("totalCount");
}

describe("管理画面 export の行数上限", () => {
  test("走査対象が空でない（0 件と「違反なし」を分ける）", () => {
    const routes = exportRoutes();

    expect(routes.length).toBeGreaterThan(4);
    expect(routes).toContain("customers");
    expect(routes).toContain("audit-logs");
  });

  test("落ちるべき書き方: 409 経路を持たない route", () => {
    expect(
      returnsTruncationConflict(
        "const rows = await getRows();\nreturn new Response(generateCsv(rows));",
      ),
    ).toBe(false);
  });

  test("落ちてはいけない書き方: truncated を 409 + totalCount で返す", () => {
    expect(
      returnsTruncationConflict(
        "if (result.truncated) {\n  return Response.json({ error: MSG, totalCount: result.totalCount }, { status: 409 });\n}",
      ),
    ).toBe(true);
  });

  test("上限値の定義は 1 箇所だけ", () => {
    // 各 route / query が自前の上限リテラルを持つと、片方だけ変えたときに
    // 「409 は出ないのに OOM する」状態になる。
    const limits = readFileSync(
      join(ROOT, "src", "shared", "domain", "exports", "limits.ts"),
      "utf8",
    );
    const declarationMatch = limits.match(
      /export const ADMIN_EXPORT_ROW_LIMIT\s*=\s*(?<value>[0-9A-Fa-fXxOoBb_]+)\s*;/u,
    );
    const limitLiteral = declarationMatch?.groups?.["value"];
    expect(limitLiteral).toBeDefined();
    if (limitLiteral === undefined) {
      throw new Error("ADMIN_EXPORT_ROW_LIMIT declaration missing");
    }
    const selfDefinedPattern = new RegExp(`=\\s*${limitLiteral}\\s*;`, "u");

    expect(selfDefinedPattern.test("const MAX = 10_000;")).toBe(true);

    const selfDefined = exportRoutes().filter((route) => {
      const source = readFileSync(join(EXPORT_ROOT, route, "route.ts"), "utf8");
      return selfDefinedPattern.test(source);
    });
    expect(selfDefined).toEqual([]);
  });

  test("全 export route が 409 経路を持つ", () => {
    const offenders = exportRoutes().filter(
      (route) =>
        !returnsTruncationConflict(
          readFileSync(join(EXPORT_ROOT, route, "route.ts"), "utf8"),
        ),
    );

    expect(offenders).toEqual([]);
  });
});
