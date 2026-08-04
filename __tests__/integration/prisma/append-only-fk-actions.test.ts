/**
 * append-only テーブルが外部キーの参照アクションで書き換えられないことのゲート（実 DB 必須）。
 *
 * **このテストが守る不変条件**:
 *   append-only trigger を持つテーブルへ向いた FK は、そのテーブルに UPDATE を発行する
 *   参照アクション（ON DELETE SET NULL / SET DEFAULT、ON UPDATE CASCADE / SET NULL /
 *   SET DEFAULT）を持たない。
 *
 * PostgreSQL の `ON DELETE SET NULL` は参照側テーブルへの実 UPDATE として実行されるため、
 * 行レベル BEFORE UPDATE の append-only trigger に当たって `RAISE EXCEPTION` になり、
 * **親の DELETE ごと rollback する**。実際に 2 本の本番導線が落ちていた:
 *   * 顧客アカウント削除（audit_logs.userId → user が SET NULL）
 *   * 顧客マージ（terms_agreements.customerId → customers が SET NULL）
 * どちらも「削除できない」ではなく「削除しようとすると例外で全部巻き戻る」という壊れ方で、
 * schema.prisma を読んでも append-only trigger は見えない（Prisma DSL で表現できない）ため
 * 気づけない。型でも lint でも検出できないので DB カタログを直接見るしかない。
 *
 * ON DELETE CASCADE は「行を消す」であって UPDATE ではないので対象外にしている。
 * inquiry_status_history.inquiryId がそれで、データ保持 purge が bypass GUC を立てた
 * 状態でだけ通る正規経路（DELETE trigger 側が governs する）。
 *
 * 対象テーブルは `prevent_%_mutation` trigger 関数から動的に発見する。**新しい
 * append-only テーブルを足した人が何も登録しなくても自動で対象に入る**（allowlist 方式だと
 * trigger を足した時に allowlist も忘れる）。
 *
 * == 実行条件 ==
 *   ローカル: bun run test:integration（test-db を自動起動 + migrate deploy）
 *   CI: unit-tests job が postgres service + prisma migrate deploy 済みのため自動実行。
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Client } from "pg";
import { resolveTestDatabaseUrl } from "../../../scripts/test-db-url";

/** pg_constraint の confupdtype / confdeltype コード。 */
const ACTION_LABEL: Record<string, string> = {
  a: "NO ACTION",
  r: "RESTRICT",
  c: "CASCADE",
  n: "SET NULL",
  d: "SET DEFAULT",
};

/** 参照側テーブルへ UPDATE を発行する参照アクション。 */
const UPDATES_THE_CHILD_ON_DELETE = new Set(["n", "d"]);
const UPDATES_THE_CHILD_ON_UPDATE = new Set(["c", "n", "d"]);

let client: Client;

beforeAll(async () => {
  const { url } = resolveTestDatabaseUrl(process.env["TEST_DATABASE_URL"]);
  client = new Client({ connectionString: url });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

async function findAppendOnlyTables(): Promise<string[]> {
  const result = await client.query<{ readonly relname: string }>(
    `SELECT DISTINCT rel.relname
       FROM pg_trigger trg
       JOIN pg_class rel ON rel.oid = trg.tgrelid
       JOIN pg_proc fn ON fn.oid = trg.tgfoid
       JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      WHERE NOT trg.tgisinternal
        AND ns.nspname = 'public'
        AND fn.proname LIKE 'prevent\\_%\\_mutation'
      ORDER BY rel.relname`,
  );
  return result.rows.map((row) => row.relname);
}

describe("append-only テーブルへの FK 参照アクション", () => {
  test("append-only trigger を持つテーブルを検出できている", async () => {
    const tables = await findAppendOnlyTables();
    // 検出が壊れて 0 件になると以降の test が空回りで緑になる（vacuous pass 防止）
    expect(tables).toEqual([
      "audit_logs",
      "inquiry_status_history",
      "refunds",
      "terms_agreements",
    ]);
  });

  test("append-only テーブルを UPDATE する参照アクションが 1 件も無い", async () => {
    const tables = await findAppendOnlyTables();

    const offenders = await client.query<{
      readonly child: string;
      readonly conname: string;
      readonly upd: string;
      readonly del: string;
    }>(
      `SELECT rel.relname AS child, con.conname,
              con.confupdtype AS upd, con.confdeltype AS del
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid = con.conrelid
         JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        WHERE con.contype = 'f'
          AND ns.nspname = 'public'
          AND rel.relname = ANY($1::text[])
        ORDER BY rel.relname, con.conname`,
      [tables],
    );

    const violations = offenders.rows
      .filter(
        (row) =>
          UPDATES_THE_CHILD_ON_DELETE.has(row.del) ||
          UPDATES_THE_CHILD_ON_UPDATE.has(row.upd),
      )
      .map(
        (row) =>
          `${row.child}.${row.conname}: ON UPDATE ${ACTION_LABEL[row.upd]} / ON DELETE ${ACTION_LABEL[row.del]}`,
      );

    expect({
      violations,
      hint:
        violations.length > 0
          ? "append-only テーブルへ UPDATE を発行する参照アクションです。親の削除/更新が trigger に弾かれて丸ごと rollback します。FK を外して論理参照にするか、NO ACTION / RESTRICT へ倒してください"
          : "",
    }).toEqual({ violations: [], hint: "" });
  });

  test("監査ログを持つ user を実際に削除できる", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const hash = "a".repeat(64);

    await client.query("BEGIN");
    let setupOk = false;
    let failure: string | null = null;
    try {
      await client.query(
        `INSERT INTO "users" ("id","name","email",email_verified,"role",created_at,updated_at)
         VALUES ($1,'append-only probe','append-only-probe@example.test',false,'ADMIN',now(),now())`,
        [userId],
      );
      await client.query(
        `INSERT INTO "audit_logs"
           ("id","userId","action","resource","resourceId","metadata","createdAt","sequence",
            "previousHash","entryHash","hashAlgorithm","hashKeyId","chainVersion")
         VALUES (gen_random_uuid(),$1,'CREATE','probe','probe','{}'::jsonb,now(),
                 (SELECT coalesce(max("sequence"),0)+1 FROM "audit_logs"),$2,$2,'HMAC-SHA256','probe',1)`,
        [userId, hash],
      );
      setupOk = true;
      await client.query(`DELETE FROM "users" WHERE "id" = $1`, [userId]);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      await client.query("ROLLBACK");
    }

    // setup 自体が別の理由で落ちると「削除できた」と読み間違えるので分けて表明する
    expect({ setupOk, failure }).toEqual({ setupOk: true, failure: null });
  });

  test("規約同意記録を持つ customer を実際に削除できる", async () => {
    const customerId = "22222222-2222-4222-8222-222222222222";

    await client.query("BEGIN");
    let setupOk = false;
    let failure: string | null = null;
    try {
      await client.query(
        `INSERT INTO "customers"
           ("id",last_name,first_name,"email",email_canonical,updated_at)
         VALUES ($1,'probe','probe','append-only-merge@example.test','append-only-merge@example.test',now())`,
        [customerId],
      );
      const terms = await client.query<{ readonly id: string }>(
        `SELECT "id" FROM "terms_documents" LIMIT 1`,
      );
      const termsId = terms.rows[0]?.id;
      if (termsId === undefined) {
        throw new Error(
          "terms_documents が空です。seed 済みの test DB が必要です",
        );
      }
      await client.query(
        `INSERT INTO "terms_agreements"
           ("id","termsId","customerId","contentSnapshot","contentHash","agreedAt","scope")
         VALUES (gen_random_uuid(),$1,$2,'probe','probe',now(),'RESERVATION')`,
        [termsId, customerId],
      );
      setupOk = true;
      await client.query(`DELETE FROM "customers" WHERE "id" = $1`, [
        customerId,
      ]);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      await client.query("ROLLBACK");
    }

    expect({ setupOk, failure }).toEqual({ setupOk: true, failure: null });
  });
});
