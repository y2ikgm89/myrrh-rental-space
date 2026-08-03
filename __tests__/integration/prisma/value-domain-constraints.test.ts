/**
 * 金額・数量・率の値域制約が実際に効いていることのゲート（実 DB 必須）。
 *
 * **このテストが守る不変条件**:
 *   負の金額・100% を超える税率・0 以下の定員・両方の親を持つ領収書は DB が拒否する。
 *
 * 制約の「存在」だけを確認しても意味が無い（述語が間違っていても存在はする）ので、
 * **1 制約につき 1 回、実際に違反行を INSERT して拒否されることを確かめる**。全て
 * `BEGIN … ROLLBACK` の中で行うのでテスト DB は汚れない。
 *
 * これらは 20260803050000 以前は Zod と domain のコードだけが守っており、DB は
 * 負の金額も 200% の税率も受理していた。同種の CHECK は Event 系と space_rate_plans に
 * 既にあり、予約・スペース・クーポン・返金・領収書の側だけが素通しだった。
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

/**
 * 違反行の INSERT が指定の制約名で拒否されることを確かめる。
 *
 * setup が別の理由（NOT NULL 漏れ・FK 不足）で落ちると「拒否された」と読み間違える
 * ため、失敗メッセージに実際の理由をそのまま載せて突き合わせる。
 */
async function expectRejectedBy(
  constraintName: string,
  sql: string,
  params: readonly unknown[] = [],
): Promise<void> {
  await client.query("BEGIN");
  let message: string | null = null;
  try {
    await client.query(sql, [...params]);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  } finally {
    await client.query("ROLLBACK");
  }
  expect(message).toContain(constraintName);
}

/** 予約の必須列を全部埋めたうえで、1 列だけ違反値にする。 */
function reservationInsert(violating: string): string {
  return `
    INSERT INTO "reservations" (
      "id","spaceId","customerId","startTime","endTime","status","paymentStatus",
      "basePrice","totalPrice","rateBreakdownJson","taxRateType","taxRate",
      "taxAmount","totalPriceWithTax","createdAt","updatedAt"
    )
    SELECT gen_random_uuid(), s."id", c."id", now(), now() + interval '1 hour',
           'PENDING','UNPAID', ${violating}, '{}'::jsonb, 'standard', 10, 0, 0, now(), now()
      FROM "spaces" s CROSS JOIN "customers" c
     LIMIT 1`;
}

describe("値域 CHECK 制約", () => {
  test("前提: 予約・スペース・顧客の行が存在する", async () => {
    // 行が無いと上の INSERT … SELECT が 0 行になり、拒否されないまま緑になる
    const counts = await client.query<{
      readonly spaces: number;
      readonly customers: number;
    }>(
      `SELECT (SELECT count(*)::int FROM "spaces") AS spaces,
              (SELECT count(*)::int FROM "customers") AS customers`,
    );
    expect(counts.rows[0]?.spaces ?? 0).toBeGreaterThan(0);
    expect(counts.rows[0]?.customers ?? 0).toBeGreaterThan(0);
  });

  test("予約の金額に負の値を入れられない", async () => {
    await expectRejectedBy(
      "reservations_money_non_negative_check",
      reservationInsert("-1, 0"),
    );
  });

  test("予約の税率が 100 を超えられない", async () => {
    await expectRejectedBy(
      "reservations_tax_rate_range_check",
      `INSERT INTO "reservations" (
         "id","spaceId","customerId","startTime","endTime","status","paymentStatus",
         "basePrice","totalPrice","rateBreakdownJson","taxRateType","taxRate",
         "taxAmount","totalPriceWithTax","createdAt","updatedAt"
       )
       SELECT gen_random_uuid(), s."id", c."id", now(), now() + interval '1 hour',
              'PENDING','UNPAID', 0, 0, '{}'::jsonb, 'standard', 101, 0, 0, now(), now()
         FROM "spaces" s CROSS JOIN "customers" c LIMIT 1`,
    );
  });

  test("スペースの定員を 0 にできない", async () => {
    await expectRejectedBy(
      "spaces_capacity_positive_check",
      `UPDATE "spaces" SET "capacity" = 0`,
    );
  });

  test("スペースの時間単価を負にできない", async () => {
    await expectRejectedBy(
      "spaces_hourly_price_non_negative_check",
      `UPDATE "spaces" SET "hourlyPrice" = -1`,
    );
  });

  test("パーセント割引のスペースに 100 を超える割引値を入れられない", async () => {
    await expectRejectedBy(
      "spaces_discount_value_range_check",
      `UPDATE "spaces" SET "discountType" = 'percentage', "discountValue" = 101`,
    );
  });

  test("パーセントクーポンに 100 を超える割引値を入れられない", async () => {
    await expectRejectedBy(
      "coupons_discount_value_range_check",
      `INSERT INTO "coupons" ("id","code","name","type","discountValue","validFrom","createdAt","updatedAt")
       VALUES (gen_random_uuid(),'PROBE101','probe','PERCENTAGE',101,now(),now(),now())`,
    );
  });

  test("クーポンの利用回数上限を 0 にできない", async () => {
    await expectRejectedBy(
      "coupons_usage_range_check",
      `INSERT INTO "coupons" ("id","code","name","type","discountValue","usageLimit","validFrom","createdAt","updatedAt")
       VALUES (gen_random_uuid(),'PROBE0','probe','FIXED_AMOUNT',100,0,now(),now(),now())`,
    );
  });

  test("0 円の返金を記録できない", async () => {
    await expectRejectedBy(
      "refunds_amount_positive_check",
      `INSERT INTO "refunds" ("id","reservationId","amount","reason","refundedByType","stripeRefundId","createdAt")
       SELECT gen_random_uuid(), r."id", 0, 'probe', 'ADMIN', 'probe_' || gen_random_uuid()::text, now()
         FROM "reservations" r LIMIT 1`,
    );
  });

  test("予約とイベント申込の両方を指す領収書を作れない", async () => {
    await expectRejectedBy(
      "receipts_target_exclusive_check",
      `INSERT INTO "receipts" (
         "id","serialNo","reservationId","eventRegistrationId","recipientName",
         "amount","taxRate","issuerSnapshot","updatedAt"
       )
       SELECT gen_random_uuid(), 'PROBE-' || substr(gen_random_uuid()::text, 1, 8),
              r."id", e."id", 'probe', 0, 10, '{}'::jsonb, now()
         FROM "reservations" r CROSS JOIN "event_registrations" e LIMIT 1`,
    );
  });
});
