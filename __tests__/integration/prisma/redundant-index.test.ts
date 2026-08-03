/**
 * 冗長な索引が存在しないことのゲート（実 DB 必須）。
 *
 * **このテストが守る不変条件**:
 *   ある索引が、同じ表・同じ access method・同じ述語・同じ opclass を持つ別の索引の
 *   先頭プレフィクスに完全に含まれるなら、それは冗長である。
 *
 * 冗長索引は**検索結果を一切変えない**（プランナはより広い索引を使える）。
 * 変わるのは INSERT / UPDATE / DELETE のたびに払う B-tree 更新コストとディスクだけなので、
 * 増えても誰も気づかない。実測では 349 本中 20 本が冗長で、しかも書込の重い表
 * （reservations / event_registrations / inquiries / audit_logs）に偏っていた。
 *
 * 2 種類を見る:
 *   - 完全重複: 同じ列を持つ UNIQUE 索引がある（プレーン側は完全に無駄）
 *   - プレフィクス重複: その列を先頭に持つ複合索引がある（単列側が不要）
 *
 * ## `indkey` / `indclass` の添字は 0 始まり
 *
 * int2vector / oidvector を配列へ cast すると**下限が 0** になる。1 始まりのつもりで
 * `arr[1]` を書くと 1 要素の索引で NULL になり、**join が成立せず検出が黙って 0 件**
 * になる（実際にこれで「冗長は 3 本」と誤って報告した）。ここでは配列を JS 側へ持ってきて
 * 添字の解釈を SQL に委ねない。
 *
 * == 実行条件 ==
 *   ローカル: bun run test:integration（test-db を自動起動 + migrate deploy）
 *   CI: unit-tests job が postgres service + prisma migrate deploy 済みのため自動実行。
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Client } from "pg";
import { resolveTestDatabaseUrl } from "../../../scripts/test-db-url";

type IndexRow = {
  readonly name: string;
  readonly tbl: string;
  readonly cols: number[];
  readonly uniq: boolean;
  readonly pk: boolean;
  readonly pred: string;
  readonly ops: number[];
  readonly am: string;
};

let client: Client;
let indexes: readonly IndexRow[];

beforeAll(async () => {
  const { url } = resolveTestDatabaseUrl(process.env["TEST_DATABASE_URL"]);
  client = new Client({ connectionString: url });
  await client.connect();

  indexes = (
    await client.query<IndexRow>(
      `SELECT i.indexrelid::regclass::text AS name,
              i.indrelid::regclass::text   AS tbl,
              i.indkey::int2[]             AS cols,
              i.indisunique                AS uniq,
              i.indisprimary               AS pk,
              coalesce(pg_get_expr(i.indpred, i.indrelid), '') AS pred,
              i.indclass::oid[]            AS ops,
              am.amname                    AS am
         FROM pg_index i
         JOIN pg_class rel ON rel.oid = i.indrelid
         JOIN pg_class idx ON idx.oid = i.indexrelid
         JOIN pg_am am ON am.oid = idx.relam
         JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        WHERE ns.nspname = 'public'`,
    )
  ).rows;
});

afterAll(async () => {
  await client.end();
});

/** `narrow` が `wide` の先頭プレフィクスに完全に含まれるか。 */
function isCoveredBy(narrow: IndexRow, wide: IndexRow): boolean {
  if (narrow.name === wide.name) return false;
  if (narrow.tbl !== wide.tbl) return false;
  if (narrow.am !== wide.am) return false;
  if (narrow.pred !== wide.pred) return false;
  // 一意索引は制約を担っているので「冗長側」にはならない
  if (narrow.uniq) return false;
  if (narrow.cols.length > wide.cols.length) return false;

  const width = narrow.cols.length;
  if (wide.cols.slice(0, width).join(",") !== narrow.cols.join(",")) {
    return false;
  }
  if (
    wide.ops.slice(0, width).join(",") !== narrow.ops.slice(0, width).join(",")
  ) {
    return false;
  }
  // 同じ列数なら、相手が UNIQUE / PRIMARY のときだけ冗長と言える
  if (width === wide.cols.length) return wide.uniq || wide.pk;
  return true;
}

describe("冗長索引", () => {
  test("索引を取得できている", () => {
    // 取得が壊れて 0 件になると以降が空回りで緑になる（vacuous pass 防止）
    expect(indexes.length).toBeGreaterThan(100);
  });

  test("他の索引に完全に含まれる索引が無い", () => {
    const redundant = new Set<string>();
    for (const narrow of indexes) {
      for (const wide of indexes) {
        if (isCoveredBy(narrow, wide)) {
          redundant.add(`${narrow.tbl}: ${narrow.name} ⊂ ${wide.name}`);
        }
      }
    }

    expect({
      redundant: [...redundant].sort(),
      hint:
        redundant.size > 0
          ? "同じ列を先頭に持つ索引が既にある。検索結果は変わらないが INSERT/UPDATE/DELETE のたびに無駄な B-tree 更新を払うので、狭い方の @@index 宣言を消す"
          : "",
    }).toEqual({ redundant: [], hint: "" });
  });
});
