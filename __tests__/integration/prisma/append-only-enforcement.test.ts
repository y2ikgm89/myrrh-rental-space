/**
 * append-only の 4 表が、**実際に消せない / 書き換えられない**ことを実 DB で確かめる。
 *
 * ## なぜ静的検査では足りないか
 *
 * この保証を見ている gate はこれまで「src に `update` / `delete` の呼出が無いこと」と
 * 「bypass GUC を立てるファイルが allowlist の 2 件だけであること」を**ソースの形**で
 * 見ていた。それは「アプリが触らない」ことの検査であって、「DB が拒否する」ことの
 * 検査ではない。trigger を落としても、関数本体を空にしても、静的側は緑のまま通る。
 *
 * ## TRUNCATE の穴
 *
 * 拒否していたのは行レベルの BEFORE UPDATE / BEFORE DELETE だけだった。
 * PostgreSQL の TRUNCATE は ON DELETE trigger を発火させないので、
 * `TRUNCATE audit_logs;` の 1 行で改ざん検知の hash chain ごと消せた。
 * **監査ログを消せる監査ログは、無いのと同じ。**
 *
 * ## 0 件の DML は検査にならない
 *
 * 行レベル trigger は**該当行が無ければ発火しない**。空のテーブルへ DELETE を投げて
 * 「通った」ことは trigger を通過した証明にならない（過去に実際にそれで偽の緑を作った）。
 * ここでは必ず 1 行入れてから消しにいく。そのために FK 先の親行も本物を作る
 * （Prisma の FK は DEFERRABLE ではないので、存在しない親を指すと INSERT の時点で
 * 落ち、拒否の理由を読み違える）。
 *
 * ## 巻き戻し
 *
 * probe はすべて `BEGIN … ROLLBACK` の中で行う。TRUNCATE もトランザクション内で
 * ロールバックできる（PostgreSQL は MVCC 安全な TRUNCATE を実装している）。
 * 親行だけ `afterAll` で消す。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "pg";
import { resolveTestDatabaseUrl } from "../../../scripts/test-db-url";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
const describeMaybe = TEST_DB_URL ? describe : describe.skip;

let client: Client;

const APPEND_ONLY_TABLES = [
  "audit_logs",
  "terms_agreements",
  "refunds",
  "inquiry_status_history",
] as const;

type AppendOnlyTable = (typeof APPEND_ONLY_TABLES)[number];

/** probe が使う親行の id（beforeAll で採番）。 */
const parents = {
  locationId: "",
  spaceId: "",
  customerId: "",
  reservationId: "",
  termsDocumentId: "",
  inquiryId: "",
};

// 短い suffix にする。slug 等の列は VarChar(50) で、UUID をそのまま
// 足すと溢れて「拒否された」を長さ違反と読み違える。
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);

/** 対象表に 1 行だけ作る INSERT。親 id を使うので呼び出し時に組み立てる。 */
function insertOneRow(table: AppendOnlyTable): string {
  switch (table) {
    case "audit_logs":
      return `
        INSERT INTO "audit_logs" (
          "id","sequence","action","resource",resource_id,"metadata",
          entry_hash,previous_hash,hash_algorithm,hash_key_id,chain_version,created_at
        ) VALUES (
          gen_random_uuid(),
          -- chain の sequence は既存の最大値の次。probe は巻き戻すので採番は消える。
          (SELECT COALESCE(MAX("sequence"), 0) + 1 FROM "audit_logs"),
          'CREATE', 'probe', 'probe', '{}'::jsonb,
          repeat('a', 64), repeat('b', 64), 'HMAC-SHA256', 'v1', 1, now()
        )`;
    case "terms_agreements":
      return `
        INSERT INTO "terms_agreements" (
          "id",terms_id,"scope",resource_id,agreed_at,guest_email,
          content_snapshot,content_hash
        ) VALUES (
          gen_random_uuid(), '${parents.termsDocumentId}', 'RESERVATION',
          '${parents.reservationId}', now(), 'probe@example.com',
          '同意内容のスナップショット', repeat('c', 64)
        )`;
    case "refunds":
      return `
        INSERT INTO "refunds" (
          "id",reservation_id,"amount",stripe_refund_id,refunded_by_type,"status",created_at
        ) VALUES (
          gen_random_uuid(), '${parents.reservationId}', 100,
          'probe-' || gen_random_uuid()::text, 'ADMIN', 'succeeded', now()
        )`;
    case "inquiry_status_history":
      return `
        INSERT INTO "inquiry_status_history" (
          "id",inquiry_id,from_status,to_status,created_at
        ) VALUES (
          gen_random_uuid(), '${parents.inquiryId}', 'NEW', 'IN_PROGRESS', now()
        )`;
  }
}

/** 拒否されなかったときに返る番人文字列。 */
const NOT_REJECTED = "(拒否されず通ってしまった)";

/** 1 行入れた直後に `sql` を流し、拒否メッセージを返す。必ず巻き戻す。 */
async function attemptAfterSeedingOneRow(
  table: AppendOnlyTable,
  sql: string,
  bypass?: string,
): Promise<string> {
  await client.query("BEGIN");
  let message = NOT_REJECTED;
  try {
    await client.query(insertOneRow(table));
    // refunds 等に DEFERRABLE CONSTRAINT TRIGGER が載っていると、INSERT の
    // pending trigger events が残ったまま TRUNCATE すると
    // 「cannot TRUNCATE … because it has pending trigger events」で先に落ち、
    // append-only 拒否メッセージを検証できない。破壊的 SQL の前に即時発火させる。
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    if (bypass !== undefined) {
      await client.query(`SELECT set_config($1, 'purge', true)`, [bypass]);
    }
    await client.query(sql);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  } finally {
    await client.query("ROLLBACK");
  }
  return message;
}

describeMaybe("append-only の 4 表は DB が実際に守っている", () => {
  beforeAll(async () => {
    const { url } = resolveTestDatabaseUrl(process.env["TEST_DATABASE_URL"]);
    client = new Client({ connectionString: url });
    await client.connect();

    const one = async (sql: string): Promise<string> => {
      const result = await client.query<{ id: string }>(sql);
      const id = result.rows[0]?.id;
      if (id === undefined) throw new Error(`親行を作れなかった: ${sql}`);
      return id;
    };

    parents.locationId = await one(`
      INSERT INTO "locations" ("id","slug","name","address",image_url,is_active,updated_at)
      VALUES (gen_random_uuid(), 'append-only-loc-${suffix}', 'Append Only Loc',
              '東京都テスト区1-2-3', 'https://example.com/l.jpg', false, now())
      RETURNING id::text AS id`);
    parents.spaceId = await one(`
      INSERT INTO "spaces" (
        "id","slug","name",description_json,description_html,description_plain_text,
        "capacity",hourly_price,main_image_url,location_id,is_published,is_active,updated_at
      ) VALUES (
        gen_random_uuid(), 'append-only-space-${suffix}', 'Append Only Space',
        '{}'::jsonb, '', '', 4, 1000, 'https://example.com/s.jpg',
        '${parents.locationId}', false, false, now()
      ) RETURNING id::text AS id`);
    parents.customerId = await one(`
      INSERT INTO "customers" ("id",last_name,first_name,"email",email_canonical,updated_at)
      VALUES (gen_random_uuid(), '山田', '太郎',
              'append-only-${suffix}@example.com', 'append-only-${suffix}@example.com', now())
      RETURNING id::text AS id`);
    parents.reservationId = await one(`
      INSERT INTO "reservations" (
        "id",space_id,customer_id,start_time,end_time,"status",payment_status,
        base_price,total_price,rate_breakdown_json,tax_rate_type,tax_rate,
        tax_amount,total_price_with_tax,created_at,updated_at
      ) VALUES (
        gen_random_uuid(), '${parents.spaceId}', '${parents.customerId}',
        TIMESTAMPTZ '2099-06-01 01:00+00', TIMESTAMPTZ '2099-06-01 03:00+00',
        'CONFIRMED', 'PAID', 1000, 1000, '{}'::jsonb, 'STANDARD', 10, 100, 1100, now(), now()
      ) RETURNING id::text AS id`);
    parents.termsDocumentId = await one(`
      INSERT INTO "terms_documents" (
        "id","type","slug","title",content_json,content_html,display_order,updated_at
      ) VALUES (
        gen_random_uuid(), 'TERMS_OF_SERVICE', 'append-only-terms-${suffix}',
        'Append Only Terms', '{}'::jsonb, '',
        -- display_order は deleted_at IS NULL の行の間で unique。負の待避域を使い、
        -- seed 済み DB でも未 seed の CI でも衝突しないようにする。
        -1000000 - floor(random() * 1000000)::int, now()
      )
      RETURNING id::text AS id`);
    parents.inquiryId = await one(`
      INSERT INTO "inquiries" ("id",receipt_number,"name","email","subject","message",updated_at)
      VALUES (gen_random_uuid(), 'AO-${suffix}', '山田太郎',
              'append-only-${suffix}@example.com', '件名', '本文', now())
      RETURNING id::text AS id`);
  });

  afterAll(async () => {
    // probe は全部巻き戻っているので、消すのは親行だけ（FK 安全な順序）。
    // beforeAll が途中で落ちた場合に備えて、採番できた id だけ消す
    // （空文字を uuid 列へ渡すと 22P02 で本当の失敗理由が隠れる）。
    const del = async (table: string, id: string): Promise<void> => {
      if (id === "") return;
      await client.query(`DELETE FROM "${table}" WHERE id = $1`, [id]);
    };
    await del("inquiries", parents.inquiryId);
    await del("terms_documents", parents.termsDocumentId);
    await del("reservations", parents.reservationId);
    await del("spaces", parents.spaceId);
    await del("customers", parents.customerId);
    await del("locations", parents.locationId);
    await client.end();
  });

  test("親行を作れている（probe が空振りしていない）", () => {
    expect(Object.values(parents).filter((id) => id === "")).toEqual([]);
  });

  for (const table of APPEND_ONLY_TABLES) {
    test(`${table}: 既存行の DELETE は拒否される`, async () => {
      const message = await attemptAfterSeedingOneRow(
        table,
        `DELETE FROM "${table}"`,
      );
      expect(message).toContain("append-only");
      expect(message).toContain("DELETE");
    });

    test(`${table}: TRUNCATE は拒否される（行レベル trigger は発火しない）`, async () => {
      const message = await attemptAfterSeedingOneRow(
        table,
        `TRUNCATE "${table}" CASCADE`,
      );
      expect(message).toContain("append-only");
      expect(message).toContain("TRUNCATE");
    });
  }

  test("audit_logs: 既存行の UPDATE も拒否される", async () => {
    const message = await attemptAfterSeedingOneRow(
      "audit_logs",
      `UPDATE "audit_logs" SET "action" = 'UPDATE'`,
    );
    expect(message).toContain("append-only");
    expect(message).toContain("UPDATE");
  });

  test("refunds: status だけの UPDATE は通る（唯一の可変列という契約）", async () => {
    const message = await attemptAfterSeedingOneRow(
      "refunds",
      `UPDATE "refunds" SET "status" = 'failed'`,
    );
    // ここだけは通るのが正しい（何でも拒否する trigger になっていないことの確認）。
    expect(message).toBe(NOT_REJECTED);
  });

  test("bypass GUC を立てれば purge 経路の DELETE は通る（免除が生きている）", async () => {
    const message = await attemptAfterSeedingOneRow(
      "inquiry_status_history",
      `DELETE FROM "inquiry_status_history"`,
      "myrrh.inquiry_status_history_mutation_bypass",
    );
    expect(message).toBe(NOT_REJECTED);
  });

  test("bypass GUC を立てても TRUNCATE は通らない（免除口を用意していない）", async () => {
    const message = await attemptAfterSeedingOneRow(
      "inquiry_status_history",
      `TRUNCATE "inquiry_status_history" CASCADE`,
      "myrrh.inquiry_status_history_mutation_bypass",
    );
    expect(message).toContain("TRUNCATE is not allowed");
  });
});
