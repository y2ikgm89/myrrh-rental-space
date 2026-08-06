/**
 * 外部キー列の索引カバレッジのゲート（実 DB 必須）。
 *
 * **このテストが守る不変条件**:
 *   すべての FK について、参照する側（子）の列を先頭に持つ索引が存在する。
 *
 * PostgreSQL は FOREIGN KEY を宣言しても子側の列に索引を自動生成しない。親を
 * DELETE / UPDATE するたび、RESTRICT / SET NULL / CASCADE の判定のために子テーブルを
 * 全件走査する。索引を張り忘れても**何も壊れない**（結果は正しい）ので、行が増えて
 * 遅くなるまで誰も気づかない。schema.prisma を読んでも「この列に索引が要る」とは
 * 書いていない — FK の定義から導かれる性質なので、機械で照合するしかない。
 *
 * 部分索引（`WHERE col IS NOT NULL`）も合格とする。`col = $1` は NULL を返さないので
 * プランナは等価検索にも FK 検査にもこの索引を使える。nullable で大半が NULL の
 * deletedById / resolvedBy / couponId 等は、無条件索引だと NULL ばかり溜めて
 * 書込コストだけ払うことになるため、部分索引の方が適切。
 *
 * == 実行条件 ==
 *   ローカル: bun run test:integration（test-db を自動起動 + migrate deploy）
 *   CI: unit-tests job が postgres service + prisma migrate deploy 済みのため自動実行。
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Client } from "pg";
import { resolveTestDatabaseUrl } from "../../../scripts/test-db-url";

let client: Client;

beforeAll(async () => {
  const { url } = resolveTestDatabaseUrl(process.env["TEST_DATABASE_URL"]);
  client = new Client({ connectionString: url });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

type UncoveredFk = {
  readonly child: string;
  readonly cols: string;
  readonly ref: string;
};

/**
 * 子側の列を**先頭から**カバーする索引が無い FK を返す。
 *
 * 複合 FK は列順まで一致する必要がある（索引は先頭列プレフィクスからしか使えない）。
 * `indkey` の先頭 N 要素と `conkey` を突き合わせることでそれを表現している。
 * 無効/未 ready 索引は対象外とし、nullable 列の部分索引は述語一致まで要求する。
 */
async function findUncoveredForeignKeys(): Promise<UncoveredFk[]> {
  const result = await client.query<UncoveredFk>(
    `SELECT src.relname AS child,
            (SELECT string_agg(att.attname, ',' ORDER BY k.ord)
               FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
               JOIN pg_attribute att
                 ON att.attrelid = con.conrelid AND att.attnum = k.attnum) AS cols,
            tgt.relname AS ref
       FROM pg_constraint con
       JOIN pg_class src ON src.oid = con.conrelid
       JOIN pg_class tgt ON tgt.oid = con.confrelid
       JOIN pg_namespace ns ON ns.oid = src.relnamespace
      WHERE con.contype = 'f'
        AND ns.nspname = 'public'
        AND NOT EXISTS (
          SELECT 1 FROM pg_index i
           WHERE i.indrelid = con.conrelid
             AND i.indisvalid
             AND i.indisready
             AND (i.indkey::int2[])[0:array_length(con.conkey, 1) - 1] = con.conkey
             AND (
               i.indpred IS NULL
               OR pg_get_expr(i.indpred, i.indrelid) = (
                 SELECT '(' || string_agg(
                          format('%s IS NOT NULL', att.attname),
                          ' AND ' ORDER BY k.ord
                        ) || ')'
                   FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
                   JOIN pg_attribute att
                     ON att.attrelid = con.conrelid
                    AND att.attnum = k.attnum
                  WHERE NOT att.attnotnull
               )
             )
        )
      ORDER BY src.relname, cols`,
  );
  return result.rows;
}

describe("外部キー列の索引カバレッジ", () => {
  test("FK 自体が検出できている", async () => {
    // 検出クエリが壊れて 0 件になると次の test が空回りで緑になる（vacuous pass 防止）
    const total = await client.query<{ readonly n: number }>(
      `SELECT count(*)::int AS n
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid = con.conrelid
         JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        WHERE con.contype = 'f' AND ns.nspname = 'public'`,
    );
    expect(total.rows[0]?.n ?? 0).toBeGreaterThan(50);
  });

  test("索引でカバーされていない FK が無い", async () => {
    const uncovered = await findUncoveredForeignKeys();

    expect({
      uncovered: uncovered.map((fk) => `${fk.child}(${fk.cols}) -> ${fk.ref}`),
      hint:
        uncovered.length > 0
          ? "子側の列を先頭に持つ索引を追加してください。大半が NULL の nullable 列は " +
            "@@index([col], where: { col: { not: null } }) の部分索引にする"
          : "",
    }).toEqual({ uncovered: [], hint: "" });
  });
});
