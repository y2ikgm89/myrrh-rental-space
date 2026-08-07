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
 * これらは値域 CHECK を入れるまで Zod と domain のコードだけが守っており、DB は
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
import {
  ORDER_CONSTRAINTS,
  type TemporalOrderPairKey,
} from "../../support/temporal-order-constraints";

/** FK 先を用意しないための、実在しないことが保証された UUID。 */
const ABSENT_UUID_A = "00000000-0000-4000-8000-0000000000aa";
const ABSENT_UUID_B = "00000000-0000-4000-8000-0000000000bb";

/**
 * 期間の組ごとの「逆転した行」。**制約 1 本につき 1 本の INSERT。**
 *
 * 型が `Record<TemporalOrderPairKey, string>` なので、
 * `__tests__/support/temporal-order-constraints.ts` に組を足して
 * ここへ probe を書き忘れると **tsc:test がコンパイルエラーで落ちる**。
 * 以前は宣言 8 本に対して probe が 4 本しか無く、残り 4 本
 * （`event_time_slots` / `space_rate_plans` の effective_range /
 * `announcement_bars` / `events` の slot span）は述語を `CHECK (true)` に
 * 書き換えても静的ゲート 4 本ごと緑のまま通っていた。
 *
 * **どの probe も「その制約でだけ落ちる」ことを実測してある**（9 本の順序制約を
 * 全部 DROP したうえで同じ INSERT を流し、落ちる理由が FK 違反か、あるいは
 * 通ることを確認した）。`reservations` だけは CHECK を外すと EXCLUDE 制約の
 * `tstzrange(start_time, end_time, '[)')` の構築で落ちるが、タプル単位の CHECK は
 * index への挿入より先に評価されるので、制約がある状態では CHECK 側が勝つ。
 */
const REVERSED_ROW_PROBES: Record<TemporalOrderPairKey, string> = {
  "Reservation.start_time": `
    INSERT INTO "reservations" (
      "id",space_id,customer_id,start_time,end_time,"status",payment_status,
      base_price,total_price,rate_breakdown_json,tax_rate_type,tax_rate,
      tax_amount,total_price_with_tax,created_at,updated_at
    ) VALUES (
      gen_random_uuid(), '${ABSENT_UUID_A}', '${ABSENT_UUID_B}',
      TIMESTAMPTZ '2099-02-01 12:00+09', TIMESTAMPTZ '2099-02-01 11:00+09',
      'PENDING', 'UNPAID', 0, 0, '{}'::jsonb, 'STANDARD', 10, 0, 0, now(), now()
    )`,
  "EventTimeSlot.start_at": `
    INSERT INTO "event_time_slots" ("id",event_id,start_at,end_at,"capacity",updated_at)
    VALUES (gen_random_uuid(), '${ABSENT_UUID_A}',
            TIMESTAMPTZ '2099-02-01 12:00+09', TIMESTAMPTZ '2099-02-01 11:00+09', 5, now())`,
  "SpaceRatePlan.effective_from": `
    INSERT INTO "space_rate_plans" ("id",space_id,"name",hourly_price,
                                    effective_from,effective_to,updated_at)
    VALUES (gen_random_uuid(), '${ABSENT_UUID_A}', 'probe', 1000,
            DATE '2099-02-01', DATE '2099-01-01', now())`,
  "SpaceRatePlan.start_time": `
    INSERT INTO "space_rate_plans" ("id",space_id,"name",hourly_price,
                                    start_time,end_time,updated_at)
    VALUES (gen_random_uuid(), '${ABSENT_UUID_A}', 'probe', 1000,
            '18:00', '09:00', now())`,
  "BlockedDate.start_date": `
    INSERT INTO "blocked_dates" ("id","scope",start_date,end_date,"type",created_by,updated_at)
    VALUES (gen_random_uuid(), 'GLOBAL', DATE '2099-01-10', DATE '2099-01-01',
            'OTHER', '${ABSENT_UUID_A}', now())`,
  "Coupon.valid_from": `
    INSERT INTO "coupons" ("id","code","name","type",discount_value,valid_from,valid_until,updated_at)
    VALUES (gen_random_uuid(), 'PROBE' || substr(gen_random_uuid()::text, 1, 8),
            'probe', 'FIXED_AMOUNT', 100,
            TIMESTAMPTZ '2099-02-01 00:00+09', TIMESTAMPTZ '2099-01-01 00:00+09', now())`,
  // display_order を明示する。既定値のままだと seed 済みのローカル DB で
  // `announcement_bars_display_order_key`（unique）と衝突し、CHECK を外しても
  // 別の理由で落ちる probe になる（CI の未 seed DB では起きない差）。
  // 負の待避域（`display_order <= -1000000`）は position CHECK が許している。
  "AnnouncementBar.start_at": `
    INSERT INTO "announcement_bars" ("id",display_order,start_at,end_at,updated_at)
    VALUES (gen_random_uuid(), -1999999,
            TIMESTAMPTZ '2099-02-01 00:00+09', TIMESTAMPTZ '2099-01-01 00:00+09', now())`,
  "Event.first_slot_start_at": `
    INSERT INTO "events" (
      "id","title","slug",description_json,description_html,description_plain_text,
      schedule_mode,category_id,first_slot_start_at,last_slot_end_at,updated_at
    ) VALUES (
      gen_random_uuid(), 'probe', 'probe-' || gen_random_uuid()::text,
      '{}'::jsonb, '', '', 'SINGLE_OCCURRENCE', '${ABSENT_UUID_A}',
      TIMESTAMPTZ '2099-02-01 00:00+09', TIMESTAMPTZ '2099-01-01 00:00+09', now()
    )`,
  "SmartLockPasscode.start_time": `
    INSERT INTO "smart_lock_passcodes" ("id",reservation_id,device_id,passcode_ciphertext,
                                        start_time,end_time,updated_at)
    VALUES (gen_random_uuid(), '${ABSENT_UUID_A}', '${ABSENT_UUID_B}', 'probe',
            TIMESTAMPTZ '2099-02-01 00:00+09', TIMESTAMPTZ '2099-01-01 00:00+09', now())`,
};

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
      "id",space_id,customer_id,start_time,end_time,"status",payment_status,
      base_price,total_price,rate_breakdown_json,tax_rate_type,tax_rate,
      tax_amount,total_price_with_tax,created_at,updated_at
    ) VALUES (
      gen_random_uuid(), '${ABSENT_UUID_A}', '${ABSENT_UUID_B}',
      now(), now() + interval '1 hour', 'PENDING', 'UNPAID',
      ${overrides.basePrice ?? "0"}, 0, '{}'::jsonb, 'STANDARD',
      ${overrides.taxRate ?? "10"}, 0, 0, now(), now()
    )`;
}

/**
 * SQL が**通る**ことを確かめる。
 *
 * 拒否側だけを確かめると「何でも落とす制約」でもテストが緑になるので、
 * 通ってよい値が通ることまで見て初めて範囲が確定する。
 */
async function expectAccepted(sql: string): Promise<void> {
  await client.query("BEGIN");
  let message = "";
  try {
    await client.query(sql);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  } finally {
    await client.query("ROLLBACK");
  }
  expect(message).toBe("");
}

/**
 * 料金プランの必須列を全部埋めたうえで、終端時刻だけを差し替える。
 *
 * **拒否の確認には親行が要らない。** CHECK は FK より先に評価されるので、
 * 実在しない `space_id` でも書式違反ならそこで落ちる（他の probe と同じ理由）。
 */
function ratePlanInsert(overrides: { readonly endTime: string }): string {
  return `
    INSERT INTO "space_rate_plans" (
      "id",space_id,"name",hourly_price,days_of_week,holiday_mode,
      start_time,end_time,created_at,updated_at
    ) VALUES (
      gen_random_uuid(), '${ABSENT_UUID_A}', 'probe', 0,
      '{}'::"day_of_week"[], 'ANY', '09:00', ${overrides.endTime}, now(), now()
    )`;
}

/**
 * 通る側の確認は**親行が要る**（CHECK を抜けた先で FK が待っている）。
 *
 * CI の test DB は未 seed なので既存行を拾えない。拠点 → スペース → 料金プランを
 * 1 文の CTE で作る（`expectAccepted` が丸ごと巻き戻す）。拠点は
 * `locations_active_sort_order_key`（`is_active` の partial unique）を避けるため
 * 非公開で作る。
 */
function ratePlanInsertWithParents(overrides: {
  readonly startTime: string;
  readonly endTime: string;
}): string {
  return `
    WITH loc AS (
      INSERT INTO "locations" (
        "id","slug","name","address",image_url,sort_order,is_active,updated_at
      ) VALUES (
        gen_random_uuid(), 'probe-' || gen_random_uuid()::text, 'probe',
        'probe', 'https://example.test/probe.png', 0, false, now()
      ) RETURNING "id"
    ), sp AS (
      INSERT INTO "spaces" (
        "id","slug","name",description_json,description_html,description_plain_text,
        "capacity",hourly_price,main_image_url,updated_at,location_id
      ) SELECT
        gen_random_uuid(), 'probe-' || gen_random_uuid()::text, 'probe',
        '{}'::jsonb, '<p>probe</p>', 'probe', 1, 0,
        'https://example.test/probe.png', now(), loc."id"
      FROM loc RETURNING "id"
    )
    INSERT INTO "space_rate_plans" (
      "id",space_id,"name",hourly_price,days_of_week,holiday_mode,
      start_time,end_time,created_at,updated_at
    ) SELECT
      gen_random_uuid(), sp."id", 'probe', 0,
      '{}'::"day_of_week"[], 'ANY', ${overrides.startTime}, ${overrides.endTime},
      now(), now()
    FROM sp`;
}

/** スペースの必須列を全部埋めたうえで、指定の列だけを違反値にする。 */
function spaceInsert(overrides: {
  readonly capacity?: string;
  readonly hourlyPrice?: string;
  readonly discount?: string;
  readonly gallery?: string;
}): string {
  const discountColumns = overrides.discount
    ? ",discount_type,discount_value"
    : "";
  const discountValues = overrides.discount ? `,${overrides.discount}` : "";
  const galleryColumn = overrides.gallery ? ',"gallery"' : "";
  const galleryValue = overrides.gallery ? `,${overrides.gallery}` : "";
  return `
    INSERT INTO "spaces" (
      "id","slug","name",description_json,description_html,description_plain_text,
      "capacity",hourly_price,main_image_url,updated_at,location_id${discountColumns}${galleryColumn}
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

  test("予約の税額が税率から導かれない値だと拒否される", async () => {
    // 税抜 10,000 円・税率 10% なら税額は 1,000 円。3,000 円を入れる。
    // 税込は 13,000 円にして `reservations_tax_total_derivation_check`
    // （total_price_with_tax = total_price + tax_amount）は満たすようにする —
    // そうしないと、どちらの CHECK で落ちたのか区別が付かない。
    await expectRejectedBy(
      "reservations_tax_amount_derivation_check",
      `INSERT INTO "reservations" (
         "id",space_id,customer_id,start_time,end_time,"status",payment_status,
         base_price,total_price,rate_breakdown_json,tax_rate_type,tax_rate,
         tax_amount,total_price_with_tax,created_at,updated_at
       ) VALUES (
         gen_random_uuid(), '${ABSENT_UUID_A}', '${ABSENT_UUID_B}',
         now(), now() + interval '1 hour', 'PENDING', 'UNPAID',
         10000, 10000, '{}'::jsonb, 'STANDARD', 10, 3000, 13000, now(), now()
       )`,
    );
  });

  test("領収書の税額が総額を超えられない", async () => {
    // PDF は税抜対象額を `amount - tax_amount` で毎回導出するので、
    // 超えた行は負の税抜金額を印字する。
    await expectRejectedBy(
      "receipts_tax_within_amount_check",
      `INSERT INTO "receipts" (
         "id",serial_no,reservation_id,recipient_name,
         "amount",tax_amount,tax_rate,issuer_snapshot,updated_at
       ) VALUES (
         gen_random_uuid(), 'PROBE-' || substr(gen_random_uuid()::text, 1, 8),
         '${ABSENT_UUID_A}', 'probe', 100, 200, 10, '{}'::jsonb, now()
       )`,
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
      spaceInsert({ discount: `'PERCENTAGE'::discount_type, 101` }),
    );
  });

  test("パーセントクーポンに 100 を超える割引値を入れられない", async () => {
    await expectRejectedBy(
      "coupons_discount_value_range_check",
      `INSERT INTO "coupons" ("id","code","name","type",discount_value,valid_from,updated_at)
       VALUES (gen_random_uuid(), 'PROBE' || substr(gen_random_uuid()::text, 1, 8),
               'probe', 'PERCENTAGE', 101, now(), now())`,
    );
  });

  test("クーポンの利用回数上限を 0 にできない", async () => {
    await expectRejectedBy(
      "coupons_usage_range_check",
      `INSERT INTO "coupons" ("id","code","name","type",discount_value,usage_limit,valid_from,updated_at)
       VALUES (gen_random_uuid(), 'PROBE' || substr(gen_random_uuid()::text, 1, 8),
               'probe', 'FIXED_AMOUNT', 100, 0, now(), now())`,
    );
  });

  test("0 円の返金を記録できない", async () => {
    await expectRejectedBy(
      "refunds_amount_positive_check",
      // id は明示する。DB 側 DEFAULT は外してあり、採番は Prisma 側が持つため。
      `INSERT INTO "refunds" ("id",reservation_id,"amount",refunded_by_type,stripe_refund_id)
       VALUES (gen_random_uuid(), '${ABSENT_UUID_A}', 0, 'ADMIN', 'probe_' || gen_random_uuid()::text)`,
    );
  });

  test("接続ステータスに未知の値を入れられない", async () => {
    // singleton 行は seed が作る。migration 履歴を 1 本の baseline へ畳んだ結果、
    // baseline には INSERT が 1 つも無くなったので、**このテストが自分で用意する**。
    // migration が入れてくれたデータに依存していると、畳んだ瞬間に静かに 0 行になる。
    // `updatedAt` は Prisma の `@updatedAt`（クライアント側で埋める）なので DB 既定値が
    // 無い。生 SQL で入れるときは明示しないと NOT NULL 違反になる。
    await client.query(
      `INSERT INTO "settings_stripe" ("id", updated_at) VALUES ('singleton', now())
       ON CONFLICT ("id") DO NOTHING`,
    );

    // 行が無いと 0 行更新で例外が出ず「拒否された」と読み違えるため、行数を確かめる。
    const rows = await client.query<{ readonly n: number }>(
      `SELECT count(*)::int AS n FROM "settings_stripe"`,
    );
    expect(rows.rows[0]?.n ?? 0).toBeGreaterThan(0);

    // 以前は 6 つの設定表に同じ値域の CHECK を手書きしていた。今は
    // `connection_status` enum 型へ寄せてあるので、**拒否するのは CHECK ではなく型**。
    // 制約名ではなく型名で照合する（保護は弱まっていない — 型は 6 表で共有される
    // 1 つの定義なので、値を足すときに 1 箇所しか触れない）。
    await expectRejectedBy(
      "invalid input value for enum connection_status",
      `UPDATE "settings_stripe" SET stripe_connection_status = 'typo'`,
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
      `INSERT INTO "media" ("id","filename",storage_path,"url","bucket",mime_type,"size","type","tags",updated_at)
       VALUES (gen_random_uuid(), 'probe.png', 'probe/probe.png',
               'https://example.test/probe.png', 'probe', 'image/png', 1,
               'IMAGE', '"not-an-array"'::jsonb, now())`,
    );
  });

  test("期間の列は逆転した値を受け付けない（宣言した全 9 組の向きの実測）", async () => {
    // 名前と参照列だけを見る静的ゲート（temporal-order-constraints）は
    // `<=` と `>=` を取り違えても通る。**向きはここで実際に入れて確かめる。**
    for (const [pair, constraint] of Object.entries(ORDER_CONSTRAINTS)) {
      const sql = REVERSED_ROW_PROBES[pair as TemporalOrderPairKey];
      await expectRejectedBy(constraint, sql);
    }
  });

  test("予約とイベント申込の両方を指す領収書を作れない", async () => {
    await expectRejectedBy(
      "receipts_target_exclusive_check",
      `INSERT INTO "receipts" (
         "id",serial_no,reservation_id,event_registration_id,recipient_name,
         "amount",tax_rate,issuer_snapshot,updated_at
       ) VALUES (
         gen_random_uuid(), 'PROBE-' || substr(gen_random_uuid()::text, 1, 8),
         '${ABSENT_UUID_A}', '00000000-0000-4000-8000-0000000000aa', 'probe',
         0, 10, '{}'::jsonb, now()
       )`,
    );
  });

  /**
   * 料金プランの終端時刻は半開区間のセンチネル `24:00` だけを許す。
   *
   * `24:01`〜`24:59` は「時刻として存在しないのに、辞書順では `24:00` より後ろ」
   * という最悪の値で、`start <= t AND t < end` の判定を素通りしたうえで
   * どの実時刻とも噛み合わない。書式 CHECK が `24` を特別扱いする以上、
   * **`24:00` だけ**を通すことは実際に入れて確かめる（正規表現を読むだけでは
   * `24:[0-5][0-9]` と `24:00` を取り違えても気づけない）。
   */
  test("料金プランの終端時刻は 24:00 のみで、24:01 以降は入らない", async () => {
    await expectRejectedBy(
      "space_rate_plans_end_time_format_check",
      ratePlanInsert({ endTime: "'24:01'" }),
    );
    await expectRejectedBy(
      "space_rate_plans_end_time_format_check",
      ratePlanInsert({ endTime: "'24:59'" }),
    );
    await expectRejectedBy(
      "space_rate_plans_end_time_format_check",
      ratePlanInsert({ endTime: "'25:00'" }),
    );
  });

  test("料金プランの終端時刻 24:00 と通常の時刻は通る（gate が広すぎないこと）", async () => {
    // 拒否だけを確かめると「全部落とす CHECK」でもテストが通る。
    // **通ってよい値が通ること**まで見て初めて範囲が確定する。
    // `start_time` は組ごとに変える。`00:00` は書式としては正当だが
    // `09:00` とは組めない（順序 CHECK が別に効く）ので、開始を NULL にして
    // **書式の可否だけ**を切り出す。
    const accepted: readonly { startTime: string; endTime: string }[] = [
      { startTime: "'09:00'", endTime: "'24:00'" },
      { startTime: "'09:00'", endTime: "'23:59'" },
      { startTime: "NULL", endTime: "'00:00'" },
      { startTime: "'09:00'", endTime: "NULL" },
    ];
    for (const row of accepted) {
      await expectAccepted(ratePlanInsertWithParents(row));
    }
  });

  /**
   * キャンセル実行者の種別は PG enum（`cancelled_by`）。
   *
   * VARCHAR の頃は綴り違いが黙って保存され、集計や表示の分岐から漏れた。
   * 型で拒否されることを 3 表すべてで確かめる — 列を enum へ寄せる migration は
   * 表ごとに `ALTER COLUMN ... TYPE` を並べるので、**1 表だけ書き漏らしても
   * schema.prisma 側の型は揃って見える**。
   */
  test("cancelled_by_type に enum 外の値を入れられない（3 表とも）", async () => {
    await expectRejectedBy(
      "cancelled_by",
      `UPDATE "reservations" SET cancelled_by_type = 'CUSTOMER'
       WHERE "id" = '${ABSENT_UUID_A}'`,
    );
    await expectRejectedBy(
      "cancelled_by",
      `UPDATE "reservation_series" SET cancelled_by_type = 'customer_mypage'
       WHERE "id" = '${ABSENT_UUID_A}'`,
    );
    await expectRejectedBy(
      "cancelled_by",
      `UPDATE "event_registrations" SET cancelled_by_type = 'STAFF'
       WHERE "id" = '${ABSENT_UUID_A}'`,
    );
  });

  test("cancelled_by の 4 値はすべて受け付ける（gate が広すぎないこと）", async () => {
    for (const value of [
      "CUSTOMER_MYPAGE",
      "CUSTOMER_TOKEN",
      "ADMIN",
      "SYSTEM",
    ]) {
      // 0 行 UPDATE でも列の型解決は起きるので、enum に無い値なら失敗する。
      await expectAccepted(
        `UPDATE "reservations" SET cancelled_by_type = '${value}'
         WHERE "id" = '${ABSENT_UUID_A}'`,
      );
    }
  });
});
