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
 * **ON DELETE CASCADE も同じ壊れ方をする。** 「行を消す」であって UPDATE ではないが、
 * この DB の append-only trigger は BEFORE UPDATE だけでなく **BEFORE DELETE にも
 * 張られている**（`audit_logs_no_delete` 等）。親の削除が cascade で子の DELETE を
 * 呼び、そこで RAISE EXCEPTION になって親の削除ごと巻き戻る。
 *
 * 旧版はここを無条件に対象外としていた。除外の理由（「DELETE ではないから」）が
 * この DB の実態と食い違っていたので、**参照先が BEFORE DELETE trigger を持つかを
 * カタログから読んで条件化**する。
 *
 * 唯一の例外は `inquiry_status_history.inquiry_id` で、データ保持 purge が bypass GUC を
 * 立てた状態でだけ通る正規経路。**その正当性は散文ではなく実挙動で固定する** —
 * bypass 有りで親を消せること / 無しでは同じ削除が落ちることの 2 本。
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

/**
 * 参照先が BEFORE DELETE trigger を持つとき、CASCADE も同じ壊れ方をする。
 * 親の削除が子の DELETE を呼び、trigger で落ちて親ごと巻き戻る。
 */
const DELETES_THE_CHILD_ON_DELETE = new Set(["c"]);

/**
 * 例外として許す (テーブル, FK 制約) の組。**理由は下の実挙動テストが担保する。**
 * ここへ足すだけでは通らない — 「bypass 有りで消せる / 無しで落ちる」の 2 本が要る。
 */
const CASCADE_ALLOWED = new Set(["inquiry_status_history.inquiry_id"]);

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

/**
 * 行レベル BEFORE DELETE trigger を持つテーブル。
 *
 * tgtype のビット: 1=ROW / 2=BEFORE / 8=DELETE。**散文で「DELETE trigger もある」と
 * 書く代わりにカタログから読む** — 片方だけ変わったときに気づけるように。
 */
async function findTablesWithBeforeDeleteTrigger(): Promise<Set<string>> {
  const result = await client.query<{ readonly relname: string }>(
    `SELECT DISTINCT rel.relname
       FROM pg_trigger trg
       JOIN pg_class rel ON rel.oid = trg.tgrelid
       JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      WHERE NOT trg.tgisinternal
        AND ns.nspname = 'public'
        AND (trg.tgtype & 1) <> 0
        AND (trg.tgtype & 2) <> 0
        AND (trg.tgtype & 8) <> 0`,
  );
  return new Set(result.rows.map((row) => row.relname));
}

/** FK が張られている列名（複合キーは想定しない。1 列前提が崩れたら落ちる）。 */
async function fkColumn(child: string, conname: string): Promise<string> {
  const result = await client.query<{ readonly attname: string }>(
    `SELECT att.attname
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_attribute att ON att.attrelid = con.conrelid
                            AND att.attnum = ANY(con.conkey)
      WHERE rel.relname = $1 AND con.conname = $2`,
    [child, conname],
  );
  const names = result.rows.map((row) => row.attname);
  if (names.length !== 1) {
    throw new Error(
      `${child}.${conname} は単一列の FK ではない: ${names.join(", ")}`,
    );
  }
  return names[0] ?? "";
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

    const withBeforeDelete = await findTablesWithBeforeDeleteTrigger();

    const violations: string[] = [];
    for (const row of offenders.rows) {
      const updatesChild =
        UPDATES_THE_CHILD_ON_DELETE.has(row.del) ||
        UPDATES_THE_CHILD_ON_UPDATE.has(row.upd);
      // 参照先が BEFORE DELETE trigger を持つときだけ CASCADE も違反に数える。
      const deletesChild =
        DELETES_THE_CHILD_ON_DELETE.has(row.del) &&
        withBeforeDelete.has(row.child) &&
        !CASCADE_ALLOWED.has(
          `${row.child}.${await fkColumn(row.child, row.conname)}`,
        );
      if (!updatesChild && !deletesChild) continue;
      violations.push(
        `${row.child}.${row.conname}: ON UPDATE ${ACTION_LABEL[row.upd]} / ON DELETE ${ACTION_LABEL[row.del]}`,
      );
    }

    expect({
      violations,
      hint:
        violations.length > 0
          ? "append-only テーブルの行を UPDATE または DELETE する参照アクションです。親の削除/更新が trigger に弾かれて丸ごと rollback します。FK を外して論理参照にするか、NO ACTION / RESTRICT へ倒してください（CASCADE を許すなら CASCADE_ALLOWED へ足し、bypass 有無の実挙動テストも書くこと）"
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
           ("id",user_id,"action","resource",resource_id,"metadata",created_at,"sequence",
            previous_hash,entry_hash,hash_algorithm,hash_key_id,chain_version)
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
           ("id",terms_id,customer_id,content_snapshot,content_hash,agreed_at,"scope")
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

  /**
   * `inquiry_status_history.inquiry_id` の CASCADE 免除は、**理由の散文ではなく
   * 実挙動で担保する。** 「purge は bypass GUC を立てるから正規経路」という説明は、
   * 実際に bypass 有りで通り・無しで落ちることを見て初めて成立する。
   */
  async function deleteInquiryWithHistory(
    bypass: boolean,
  ): Promise<string | null> {
    await client.query("BEGIN");
    let failure: string | null = null;
    try {
      const inquiry = await client.query<{ readonly id: string }>(
        `INSERT INTO "inquiries" ("id",receipt_number,"name","email","subject","message",updated_at)
         VALUES (gen_random_uuid(), 'FK-' || substr(gen_random_uuid()::text, 1, 8),
                 'probe', 'fk-cascade-probe@example.test', '件名', '本文', now())
         RETURNING id::text AS id`,
      );
      const inquiryId = inquiry.rows[0]?.id;
      if (inquiryId === undefined) throw new Error("inquiry を作れなかった");
      await client.query(
        `INSERT INTO "inquiry_status_history" ("id",inquiry_id,from_status,to_status,created_at)
         VALUES (gen_random_uuid(), $1, 'NEW', 'IN_PROGRESS', now())`,
        [inquiryId],
      );
      if (bypass) {
        await client.query(
          `SELECT set_config('myrrh.inquiry_status_history_mutation_bypass', 'purge', true)`,
        );
      }
      await client.query(`DELETE FROM "inquiries" WHERE "id" = $1`, [
        inquiryId,
      ]);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      await client.query("ROLLBACK");
    }
    return failure;
  }

  test("免除の根拠 1: bypass GUC を立てれば、履歴を持つ inquiry を cascade で消せる", async () => {
    expect(await deleteInquiryWithHistory(true)).toBeNull();
  });

  test("免除の根拠 2: bypass 無しでは同じ削除が append-only trigger で落ちる", async () => {
    const failure = await deleteInquiryWithHistory(false);
    expect(failure).toContain("append-only");
    expect(failure).toContain("DELETE");
  });
});
