/**
 * 時間変更でクーポンが適用外になったら `usage_count` が返ることを実 DB で固定する。
 *
 * ## なぜ
 *
 * 予約の時間を変えると `couponForCalc` が有効期間で絞り直され、外れると
 * `pricing.appliedCoupon` が null になる。書込側は `couponId` を null にするが、
 * `releaseCouponUsage` を呼ばない経路が 2 つ残っていた:
 *
 * - `applyCalendarTimeChange` — GCal 上でイベントをドラッグしたときの逆流。
 *   適格性の gate 自体が無く、クーポン付きの UNPAID 予約なら誰でも踏める。
 * - `updateCustomerReservation` — マイページ / ゲストトークンからの日時変更。
 *   「割引付きは編集できないから到達しない」とコメントされていたが、
 *   編集可否を決める `isReservationEditableForCustomerSelfServe` が見るのは
 *   **`couponDiscountAmount`**、書き換えるのは **`couponId`**。割引額が 0 の
 *   クーポン（`discountValue: 0` / 端数で 0 円 / `maxDiscountAmount: 0`）が
 *   付いた予約は編集可のまま通る。**判定する列と書き換える列が違う。**
 *
 * 結果、その 1 回は誰も使っていないのに永久に消費されたままになる。
 * `usageLimit` 付きのクーポンでは、その 1 枠が二度と配れない。
 * 例外もエラーも出ないので、気づけるのは「使えるはずのクーポンが使えない」と
 * 顧客から言われたときだけ。
 *
 * ## 何を見るか
 *
 * **実 Postgres に判定させる。** `usage_count` は raw SQL の atomic claim /
 * `updateMany` で動くので、Prisma をモックしたテストでは配線しか固定できない。
 *
 * 見本は 3 本:
 *
 * 1. GCal 逆流で有効期間の外へ動かす → `couponId` が null かつ `usageCount` 0
 * 2. マイページから有効期間の外へ動かす → 同上
 * 3. **有効なまま動かす** → `couponId` は保たれ `usageCount` は 1 のまま
 *    （落ちてはいけない形。無条件に解放する実装をここで落とす）
 *
 * ## 直し方
 *
 * 落ちたら、`updateMany` の後に置いた「`previousCouponId` が非 null で
 * `pricing.appliedCoupon` が null なら解放する」分岐が消えている。
 * **期待値の側を緩めない** — `couponId` を消したのに usage を残す状態は、
 * どの経路から見ても正しくない。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Prisma } from "@generated/prisma/client";
import { CouponType } from "@generated/prisma/enums";

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
const BASE_PRICE = HOURLY_PRICE * 2;
const TAX_RATE = 10;

function jst(time: string): Date {
  return new Date(`${RESERVATION_DATE}T${time}:00+09:00`);
}

/** sortOrder は unique。共有 test-db で他の fixture とぶつからない帯を取る。 */
let nextSortOrder = 1_800_000_000 + Math.floor(Math.random() * 10_000_000);

type Fixture = {
  spaceId: string;
  customerId: string;
  couponId: string;
  reservationId: string;
  cleanup: () => Promise<void>;
};

/**
 * 「クーポンが付いた UNPAID 予約」を 1 件作る。
 *
 * 保存されている `couponDiscountAmount` は **0**。これは
 * `discountCombinationMode: BOTH` かつ併用可のクーポンで、長時間割引が
 * 価格を使い切ったときに実際に起きる状態（`reservation.ts` の
 * `finalCouponDiscount = couponStacked` が 0 になり、`appliedCoupon` は
 * 非 null のまま）。DB の CHECK も
 * `total_price = base - coupon - duration - space` を満たす。
 *
 * この形でないと 2 本目の見本が空振りする。顧客セルフ変更の gate は
 * `couponDiscountAmount > 0` しか見ないので、割引額が正の予約は編集自体を
 * 拒否され、書込経路へ到達しない。
 *
 * `validUntil` は 12:00 に置く。10:00–12:00 のままなら有効、13:00 まで
 * 延ばすと `couponForCalc` の `validUntil >= endDateTime` を満たさなくなる。
 */
async function createCouponReservationFixture(): Promise<Fixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `coupon-release-loc-${suffix}`,
      name: `Coupon Release Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextSortOrder++,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `coupon-release-space-${suffix}`,
      name: `Coupon Release Space ${suffix}`,
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
      email: `coupon-release-${suffix}@example.com`,
      emailCanonical: `coupon-release-${suffix}@example.com`,
    },
    select: { id: true },
  });

  const coupon = await prisma.coupon.create({
    data: {
      code: `ZZRELEASE-${suffix.slice(0, 8)}`.toUpperCase(),
      name: `Coupon Release ${suffix}`,
      type: CouponType.PERCENTAGE,
      discountValue: 5,
      validFrom: jst("00:00"),
      validUntil: jst("12:00"),
      usageLimit: 1,
      // 予約作成時に claim 済みの状態を作る。
      usageCount: 1,
      isActive: true,
    },
    select: { id: true },
  });

  const taxAmount = Math.round((BASE_PRICE * TAX_RATE) / 100);
  const reservation = await prisma.reservation.create({
    data: {
      spaceId: space.id,
      customerId: customer.id,
      status: "CONFIRMED",
      paymentStatus: "UNPAID",
      startTime: jst("10:00"),
      endTime: jst("12:00"),
      basePrice: BASE_PRICE,
      totalPrice: BASE_PRICE,
      couponId: coupon.id,
      couponDiscountAmount: 0,
      rateBreakdownJson: {
        schemaVersion: 1,
        segments: [],
        totalHours: 2,
        totalBasePrice: BASE_PRICE,
        holidayFlags: {},
      },
      taxRateType: "STANDARD",
      taxRate: TAX_RATE,
      taxAmount,
      totalPriceWithTax: BASE_PRICE + taxAmount,
      guestLastName: "山田",
      guestFirstName: "太郎",
      guestEmail: `coupon-release-guest-${suffix}@example.com`,
    },
    select: { id: true },
  });

  return {
    spaceId: space.id,
    customerId: customer.id,
    couponId: coupon.id,
    reservationId: reservation.id,
    cleanup: async () => {
      await prisma.reservation.deleteMany({ where: { spaceId: space.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
      await prisma.coupon.deleteMany({ where: { id: coupon.id } });
    },
  };
}

async function readCouponState(fixture: Fixture): Promise<{
  couponId: string | null;
  usageCount: number;
}> {
  const [reservation, coupon] = await Promise.all([
    prisma.reservation.findUniqueOrThrow({
      where: { id: fixture.reservationId },
      select: { couponId: true },
    }),
    prisma.coupon.findUniqueOrThrow({
      where: { id: fixture.couponId },
      select: { usageCount: true },
    }),
  ]);
  return { couponId: reservation.couponId, usageCount: coupon.usageCount };
}

describeMaybe("時間変更で外れたクーポンは usage を返す", () => {
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
    // 「休業日に当たって早期 return し、書込へ到達しない」silent pass になるため、
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
        data: { businessHours: previousBusinessHours ?? Prisma.DbNull },
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

  test("GCal 逆流で有効期間の外へ動かすと usage が戻る", async () => {
    const fixture = await createCouponReservationFixture();

    try {
      const result = await applyCalendarTimeChange({
        reservationId: fixture.reservationId,
        spaceId: fixture.spaceId,
        existingNotes: null,
        startTime: jst("10:00"),
        endTime: jst("13:00"),
      });
      expect(result).toEqual({ success: true });

      expect(await readCouponState(fixture)).toEqual({
        couponId: null,
        usageCount: 0,
      });
    } finally {
      await fixture.cleanup();
    }
  });

  test("マイページから有効期間の外へ動かすと usage が戻る", async () => {
    const fixture = await createCouponReservationFixture();

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
        // modificationDeadlineHours。2027 年なので締切内。
        24,
      );
      expect(result.success).toBe(true);

      expect(await readCouponState(fixture)).toEqual({
        couponId: null,
        usageCount: 0,
      });
    } finally {
      await fixture.cleanup();
    }
  });

  test("有効なまま動かしたら usage は減らない（落ちてはいけない形）", async () => {
    const fixture = await createCouponReservationFixture();

    try {
      const result = await applyCalendarTimeChange({
        reservationId: fixture.reservationId,
        spaceId: fixture.spaceId,
        existingNotes: null,
        // 有効期間 12:00 の内側で 1 時間へ短縮する。
        startTime: jst("10:00"),
        endTime: jst("11:00"),
      });
      expect(result).toEqual({ success: true });

      expect(await readCouponState(fixture)).toEqual({
        couponId: fixture.couponId,
        usageCount: 1,
      });
    } finally {
      await fixture.cleanup();
    }
  });
});
