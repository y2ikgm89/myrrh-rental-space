/**
 * 金額を自動再計算する予約更新経路が `manual_adjustment_amount` も一緒に消すことを、
 * 実 DB の CHECK 制約に判定させる。
 *
 * ## なぜ
 *
 * `reservations_total_price_breakdown_check` は
 * `total_price = GREATEST(0, base - coupon - duration - space) + COALESCE(manual_adjustment_amount, 0)`
 * を要求する（`prisma/baseline/invariants.sql`）。admin が編集フォームで totalPrice を
 * 明示指定すると `manual_adjustment_amount` に差分が残る（`admin-commands.ts`）。
 * その予約を後から**自動計算に戻す**経路が `total_price` だけを書き換えると、
 * 旧調整額が足し込まれたまま照合されて 23514 になる。
 *
 * 壊れていたのは 2 経路:
 *
 * - `applyCalendarTimeChange` — GCal 上でイベントをドラッグしたときの逆流。tx が
 *   abort すると呼出側 (`reservation-calendar-inbound.ts`) の
 *   `if (result.errors.length === 0)` が false になり syncToken が進まないため、
 *   同じ変更が再配信され続ける。失敗通知は `transactionResult.success === false`
 *   の分岐にしか無いので**一通も飛ばない**。inbound 同期全体が無通知で止まる。
 * - `updateReservationCommand` — マイページ / ゲストトークンからの日時変更。
 *   `priceOverriddenById: null` は書いていたので「手動上書きなしに戻す」意図は
 *   コメントにもあったが、金額そのものを落としていた。
 *
 * ## 何を見るか
 *
 * **実 Postgres に判定させる**。この欠陥は Prisma をモックしたテストでは原理的に
 * 見えない（既存の `__tests__/unit/domain/reservations/calendar-sync-inbound-pricing.test.ts`
 * は Prisma gateway を `mock.module` で全置換しており、CHECK は評価されない）。
 * 更新後の `manualAdjustmentAmount` を読むだけでなく、**更新が成功すること自体**が
 * 制約通過の証明になっている。
 *
 * なお上の 1 文で gateway の import path を**リテラルで書かない**のは、
 * `scripts/serial-db-test-detection.ts` の除外パターンが本文中のどこに現れても
 * 一致するため。散文で書くと本ファイルが serial バケットから外れ、共有 test-db を
 * 触る他のテストと並列に走って書込が競合する。
 *
 * ## 直し方
 *
 * 落ちたら、`total_price` を自動計算値で書く updateMany の `data` から
 * `manualAdjustmentAmount: null` が消えている。**期待値の側を緩めない** —
 * 「手動調整を残したまま自動計算額を書く」行は DB が受け付けない。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Prisma } from "@generated/prisma/client";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type InboundMutationsModule =
  typeof import("@/shared/domain/reservations/calendar-sync-inbound-mutations");
type CustomerCommandsModule =
  typeof import("@/shared/domain/reservations/customer-commands");
type BusinessHoursModule = typeof import("@/shared/lib/business-hours");

let prisma: PrismaModule["prisma"];
let applyCalendarTimeChange: InboundMutationsModule["applyCalendarTimeChange"];
let updateCustomerReservation: CustomerCommandsModule["updateCustomerReservation"];

/** 2027-04-12 は月曜（既定営業日）。09:00–21:00 の内側に収まる時刻を選ぶ。 */
const RESERVATION_DATE = "2027-04-12";
const HOURLY_PRICE = 2000;

/** 2h 予約の自動計算額。admin が 3,000 円へ上書きした状態を作る。 */
const INITIAL_BASE_PRICE = HOURLY_PRICE * 2;
const OVERRIDDEN_TOTAL_PRICE = 3000;
const MANUAL_ADJUSTMENT = OVERRIDDEN_TOTAL_PRICE - INITIAL_BASE_PRICE; // -1000
const TAX_RATE = 10;

/** 変更後（3h）の自動計算額。 */
const RECALCULATED_BASE_PRICE = HOURLY_PRICE * 3;

function jst(time: string): Date {
  return new Date(`${RESERVATION_DATE}T${time}:00+09:00`);
}

let nextSortOrder = 1_700_000_000;

type Fixture = {
  spaceId: string;
  customerId: string;
  reservationId: string;
  cleanup: () => Promise<void>;
};

/**
 * Location + Space + Customer + 「admin が金額を上書き済み」の予約を 1 件作る。
 * 予約行は作成時点では CHECK を満たす（3000 = 4000 + (-1000)）。
 */
async function createOverriddenReservationFixture(): Promise<Fixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `manual-adj-loc-${suffix}`,
      name: `Manual Adj Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextSortOrder++,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `manual-adj-space-${suffix}`,
      name: `Manual Adj Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice: HOURLY_PRICE,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
      // 顧客セルフ変更経路は isActive / isPublished の両方を要求する。
      isActive: true,
      isPublished: true,
    },
    select: { id: true },
  });

  const customer = await prisma.customer.create({
    data: {
      lastName: "山田",
      firstName: "太郎",
      email: `manual-adj-${suffix}@example.com`,
      emailCanonical: `manual-adj-${suffix}@example.com`,
    },
    select: { id: true },
  });

  const taxAmount = Math.round((OVERRIDDEN_TOTAL_PRICE * TAX_RATE) / 100);
  const reservation = await prisma.reservation.create({
    data: {
      spaceId: space.id,
      customerId: customer.id,
      status: "CONFIRMED",
      paymentStatus: "UNPAID",
      startTime: jst("10:00"),
      endTime: jst("12:00"),
      basePrice: INITIAL_BASE_PRICE,
      totalPrice: OVERRIDDEN_TOTAL_PRICE,
      manualAdjustmentAmount: MANUAL_ADJUSTMENT,
      rateBreakdownJson: {
        schemaVersion: 1,
        segments: [],
        totalHours: 2,
        totalBasePrice: INITIAL_BASE_PRICE,
        holidayFlags: {},
      },
      taxRateType: "STANDARD",
      taxRate: TAX_RATE,
      taxAmount,
      totalPriceWithTax: OVERRIDDEN_TOTAL_PRICE + taxAmount,
      guestLastName: "山田",
      guestFirstName: "太郎",
      guestEmail: `manual-adj-guest-${suffix}@example.com`,
    },
    select: { id: true },
  });

  return {
    spaceId: space.id,
    customerId: customer.id,
    reservationId: reservation.id,
    cleanup: async () => {
      await prisma.reservation.deleteMany({ where: { spaceId: space.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

describeMaybe("自動再計算する経路は manual_adjustment_amount を消す", () => {
  let restoreBusinessHours: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ applyCalendarTimeChange } =
      await import("@/shared/domain/reservations/calendar-sync-inbound-mutations"));
    ({ updateCustomerReservation } =
      await import("@/shared/domain/reservations/customer-commands"));
    const { DEFAULT_BUSINESS_HOURS_WEEK }: BusinessHoursModule =
      await import("@/shared/lib/business-hours");

    // 顧客セルフ変更は営業時間・最小/最大予約時間を強制する。seed 値に依存すると
    // 「休業日に当たって早期 return し、CHECK まで到達しない」silent pass になるため、
    // 判定材料を既知値へ固定する（値は SSoT から取り、写さない）。
    const organization = await prisma.settingsOrganization.findUnique({
      where: { id: "singleton" },
      select: { businessHours: true },
    });
    const previousBusinessHours = organization?.businessHours ?? null;
    await prisma.settingsOrganization.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", businessHours: DEFAULT_BUSINESS_HOURS_WEEK },
      update: { businessHours: DEFAULT_BUSINESS_HOURS_WEEK },
    });
    restoreBusinessHours = async () => {
      await prisma.settingsOrganization.update({
        where: { id: "singleton" },
        data: {
          // 未設定だった場合は SQL NULL へ戻す（`undefined` は「書かない」の意味に
          // なり、上書きした既定値が残留する）。
          businessHours: previousBusinessHours ?? Prisma.DbNull,
        },
      });
    };

    const reservationData = {
      defaultTimeSlot: 60,
      minReservationDuration: 60,
      maxReservationDuration: 480,
    };
    await prisma.settingsReservation.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...reservationData },
      update: reservationData,
    });
  });

  afterAll(async () => {
    if (restoreBusinessHours) {
      await restoreBusinessHours();
    }
    await prisma.$disconnect();
  });

  test("GCal 逆流の時間変更（applyCalendarTimeChange）", async () => {
    const fixture = await createOverriddenReservationFixture();

    try {
      const result = await applyCalendarTimeChange({
        reservationId: fixture.reservationId,
        spaceId: fixture.spaceId,
        existingNotes: null,
        startTime: jst("10:00"),
        endTime: jst("13:00"),
      });

      // 修正前はここで 23514 が throw され、この行に到達しない。
      expect(result).toEqual({ success: true });

      const row = await prisma.reservation.findUniqueOrThrow({
        where: { id: fixture.reservationId },
        select: {
          basePrice: true,
          totalPrice: true,
          manualAdjustmentAmount: true,
          taxAmount: true,
        },
      });

      expect(row.manualAdjustmentAmount).toBeNull();
      expect(row.basePrice).toBe(RECALCULATED_BASE_PRICE);
      expect(row.totalPrice).toBe(RECALCULATED_BASE_PRICE);
      expect(row.taxAmount).toBe(
        Math.round((RECALCULATED_BASE_PRICE * TAX_RATE) / 100),
      );
    } finally {
      await fixture.cleanup();
    }
  });

  test("マイページからの日時変更（updateCustomerReservation）", async () => {
    const fixture = await createOverriddenReservationFixture();

    try {
      const result = await updateCustomerReservation(
        fixture.reservationId,
        fixture.customerId,
        {
          spaceId: fixture.spaceId,
          date: RESERVATION_DATE,
          startTime: "10:00",
          endTime: "13:00",
          numberOfGuests: 2,
          version: 0,
        },
        // 変更期限は 0 時間前＝開始時刻まで変更可（本テストの対象外の gate を無効化）。
        0,
      );

      // 修正前はここで 23514 が throw され、この行に到達しない。
      expect(result).toMatchObject({ success: true });

      const row = await prisma.reservation.findUniqueOrThrow({
        where: { id: fixture.reservationId },
        select: {
          basePrice: true,
          totalPrice: true,
          manualAdjustmentAmount: true,
        },
      });

      expect(row.manualAdjustmentAmount).toBeNull();
      expect(row.basePrice).toBe(RECALCULATED_BASE_PRICE);
      expect(row.totalPrice).toBe(RECALCULATED_BASE_PRICE);
    } finally {
      await fixture.cleanup();
    }
  });
});
