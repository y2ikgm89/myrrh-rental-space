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
 * ## fixture を作らず、存在しない ID を FK 列に入れている理由
 *
 * PostgreSQL は CHECK 制約を**タプル挿入時**に評価し、FK は AFTER トリガとして
 * 後から評価する。したがって CHECK と FK の両方に違反する行は必ず CHECK 側の
 * エラーで落ちる（実測で確認済み）。おかげで親行を用意する必要がなく、テストが
 * **DB の中身に一切依存しない**。
 *
 * これは大事な性質で、初版は `INSERT … SELECT FROM spaces CROSS JOIN customers` で
 * 既存行を借りていた。ローカルの test DB は seed 済みなので通ったが、**CI の
 * postgres service は migrate deploy だけで seed が無い**ため 0 行にマッチして
 * INSERT 自体が起きず、CI でだけ落ちた。
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

/** FK 先を用意しないための、実在しないことが保証された UUID。 */
const ABSENT_UUID_A = "00000000-0000-4000-8000-0000000000aa";
const ABSENT_UUID_B = "00000000-0000-4000-8000-0000000000bb";

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
 * INSERT が別の理由（NOT NULL 漏れ・型不一致）で落ちると「拒否された」と読み間違える
 * ため、実際のエラーメッセージをそのまま突き合わせる。成功してしまった場合も
 * 区別できるよう、その旨を文字列にして比較へ載せる。
 */
async function expectRejectedBy(
  constraintName: string,
  sql: string,
): Promise<void> {
  await client.query("BEGIN");
  let message = "(INSERT が成功してしまった)";
  try {
    await client.query(sql);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  } finally {
    await client.query("ROLLBACK");
  }
  expect(message).toContain(constraintName);
}

/** 予約の必須列を全部埋めたうえで、指定の式だけを違反値にする。 */
function reservationInsert(overrides: {
  readonly basePrice?: string;
  readonly taxRate?: string;
}): string {
  return `
    INSERT INTO "reservations" (
      "id","spaceId","customerId","startTime","endTime","status","paymentStatus",
      "basePrice","totalPrice","rateBreakdownJson","taxRateType","taxRate",
      "taxAmount","totalPriceWithTax","createdAt","updatedAt"
    ) VALUES (
      gen_random_uuid(), '${ABSENT_UUID_A}', '${ABSENT_UUID_B}',
      now(), now() + interval '1 hour', 'PENDING', 'UNPAID',
      ${overrides.basePrice ?? "0"}, 0, '{}'::jsonb, 'standard',
      ${overrides.taxRate ?? "10"}, 0, 0, now(), now()
    )`;
}

/** スペースの必須列を全部埋めたうえで、指定の列だけを違反値にする。 */
function spaceInsert(overrides: {
  readonly capacity?: string;
  readonly hourlyPrice?: string;
  readonly discount?: string;
  readonly gallery?: string;
}): string {
  const discountColumns = overrides.discount
    ? ',"discountType","discountValue"'
    : "";
  const discountValues = overrides.discount ? `,${overrides.discount}` : "";
  const galleryColumn = overrides.gallery ? ',"gallery"' : "";
  const galleryValue = overrides.gallery ? `,${overrides.gallery}` : "";
  return `
    INSERT INTO "spaces" (
      "id","slug","name","descriptionJson","descriptionHtml","descriptionPlainText",
      "capacity","hourlyPrice","mainImageUrl","updatedAt","locationId"${discountColumns}${galleryColumn}
    ) VALUES (
      gen_random_uuid(), 'probe-' || gen_random_uuid()::text, 'probe',
      '{}'::jsonb, '<p>probe</p>', 'probe',
      ${overrides.capacity ?? "1"}, ${overrides.hourlyPrice ?? "0"},
      'https://example.test/probe.png', now(), '${ABSENT_UUID_A}'${discountValues}${galleryValue}
    )`;
}

describe("値域 CHECK 制約", () => {
  test("予約の金額に負の値を入れられない", async () => {
    await expectRejectedBy(
      "reservations_money_non_negative_check",
      reservationInsert({ basePrice: "-1" }),
    );
  });

  test("予約の税率が 100 を超えられない", async () => {
    await expectRejectedBy(
      "reservations_tax_rate_range_check",
      reservationInsert({ taxRate: "101" }),
    );
  });

  test("スペースの定員を 0 にできない", async () => {
    await expectRejectedBy(
      "spaces_capacity_positive_check",
      spaceInsert({ capacity: "0" }),
    );
  });

  test("スペースの時間単価を負にできない", async () => {
    await expectRejectedBy(
      "spaces_hourly_price_non_negative_check",
      spaceInsert({ hourlyPrice: "-1" }),
    );
  });

  test("パーセント割引のスペースに 100 を超える割引値を入れられない", async () => {
    await expectRejectedBy(
      "spaces_discount_value_range_check",
      spaceInsert({ discount: `'percentage'::"DiscountType", 101` }),
    );
  });

  test("パーセントクーポンに 100 を超える割引値を入れられない", async () => {
    await expectRejectedBy(
      "coupons_discount_value_range_check",
      `INSERT INTO "coupons" ("id","code","name","type","discountValue","validFrom","updatedAt")
       VALUES (gen_random_uuid(), 'PROBE' || substr(gen_random_uuid()::text, 1, 8),
               'probe', 'PERCENTAGE', 101, now(), now())`,
    );
  });

  test("クーポンの利用回数上限を 0 にできない", async () => {
    await expectRejectedBy(
      "coupons_usage_range_check",
      `INSERT INTO "coupons" ("id","code","name","type","discountValue","usageLimit","validFrom","updatedAt")
       VALUES (gen_random_uuid(), 'PROBE' || substr(gen_random_uuid()::text, 1, 8),
               'probe', 'FIXED_AMOUNT', 100, 0, now(), now())`,
    );
  });

  test("0 円の返金を記録できない", async () => {
    await expectRejectedBy(
      "refunds_amount_positive_check",
      // id は明示する。20260803090000 で DB 側 DEFAULT を外し Prisma 側採番へ寄せたため。
      `INSERT INTO "refunds" ("id","reservationId","amount","refundedByType","stripeRefundId")
       VALUES (gen_random_uuid(), '${ABSENT_UUID_A}', 0, 'ADMIN', 'probe_' || gen_random_uuid()::text)`,
    );
  });

  test("接続ステータスに未知の値を入れられない", async () => {
    // singleton 行は存在するので UPDATE で叩く。行が無いと 0 行更新で
    // 例外が出ず「拒否された」と読み違えるため、行数も確かめる。
    const rows = await client.query<{ readonly n: number }>(
      `SELECT count(*)::int AS n FROM "settings_stripes"`,
    );
    expect(rows.rows[0]?.n ?? 0).toBeGreaterThan(0);

    await expectRejectedBy(
      "settings_stripes_connection_status_check",
      `UPDATE "settings_stripes" SET "stripeConnectionStatus" = 'typo'`,
    );
  });

  test("配列前提の jsonb 列にオブジェクトを入れられない", async () => {
    // 7 本まとめて 1 テストにせず、代表 2 本を別々の表で叩く。CHECK 名まで
    // 突き合わせるので、どちらかの制約が落ちたら名指しで分かる。
    await expectRejectedBy(
      "spaces_gallery_array_check",
      spaceInsert({ gallery: `'{"url":"x"}'::jsonb` }),
    );
    await expectRejectedBy(
      "media_tags_array_check",
      `INSERT INTO "media" ("id","filename","storagePath","url","bucket","mimeType","size","type","tags","updatedAt")
       VALUES (gen_random_uuid(), 'probe.png', 'probe/probe.png',
               'https://example.test/probe.png', 'probe', 'image/png', 1,
               'IMAGE', '"not-an-array"'::jsonb, now())`,
    );
  });

  test("予約とイベント申込の両方を指す領収書を作れない", async () => {
    await expectRejectedBy(
      "receipts_target_exclusive_check",
      `INSERT INTO "receipts" (
         "id","serialNo","reservationId","eventRegistrationId","recipientName",
         "amount","taxRate","issuerSnapshot","updatedAt"
       ) VALUES (
         gen_random_uuid(), 'PROBE-' || substr(gen_random_uuid()::text, 1, 8),
         '${ABSENT_UUID_A}', 'probe-registration-id', 'probe',
         0, 10, '{}'::jsonb, now()
       )`,
    );
  });
});
