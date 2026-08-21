/**
 * N-01: CONFIRMED 予約への並行 cancel × delete でクーポン解放が 1 回だけの検証。
 *
 * 正規キャンセルは `applyCancellation` の status claim（updateMany WHERE
 * status IN cancellable）で二重解放を閉じる。削除も同じ claim を持たないと、
 * tx 外で読んだ stale な CONFIRMED のまま `releaseCouponUsage` と
 * `wasCancelled` がもう一度走る。
 *
 * 本テストは実 Postgres 上で `cancelReservationByToken` と
 * `deleteReservationCommand` を同時に投げ、最終の `usageCount` がちょうど 1
 * 減ること、キャンセル claim（cancel 成功 / delete.wasCancelled）が
 * 高々 1 回であることを検証する。
 *
 * == 実行条件 ==
 * 実 Postgres を要求する。`bun run test:integration` は docker-compose の
 * test-db 既定値を注入する。直接 `bun test` でこのファイルを実行し
 * `TEST_DATABASE_URL` が未設定の場合のみ describe ごと skip する。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { CouponType, ReservationStatus } from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type CustomerCommandsModule =
  typeof import("@/shared/domain/reservations/customer-commands");
type LifecycleModule =
  typeof import("@/shared/domain/reservations/lifecycle-commands");

let prisma: PrismaModule["prisma"];
let cancelReservationByToken: CustomerCommandsModule["cancelReservationByToken"];
let deleteReservationCommand: LifecycleModule["deleteReservationCommand"];

type Fixture = {
  reservationId: string;
  couponId: string;
  cleanup: () => Promise<void>;
};

let nextFixtureLocationSortOrder = 1_310_000_000;

const INITIAL_USAGE_COUNT = 5;
const DEFAULT_RESERVATION_PRICING = {
  basePrice: 2000,
  totalPrice: 1500,
  couponDiscountAmount: 500,
  rateBreakdownJson: {
    schemaVersion: 1,
    segments: [],
    totalHours: 0,
    totalBasePrice: 0,
    holidayFlags: {},
  },
  taxRateType: "STANDARD" as const,
  taxRate: 10,
  taxAmount: 150,
  totalPriceWithTax: 1650,
};

async function createConfirmedReservationWithCoupon(): Promise<Fixture> {
  const suffix = crypto.randomUUID();
  const short = suffix.replaceAll("-", "").slice(0, 10).toUpperCase();
  const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

  const location = await prisma.location.create({
    data: {
      slug: `cancel-del-loc-${suffix}`,
      name: `Cancel Del Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureLocationSortOrder++,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `cancel-del-space-${suffix}`,
      name: `Cancel Del Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
    },
    select: { id: true },
  });

  const customer = await prisma.customer.create({
    data: {
      lastName: "山田",
      firstName: "太郎",
      email: `cancel-del-${suffix}@example.com`,
      emailCanonical: `cancel-del-${suffix}@example.com`,
    },
    select: { id: true },
  });

  const coupon = await prisma.coupon.create({
    data: {
      code: `CDL${short}`,
      name: `Cancel Delete Coupon ${suffix}`,
      type: CouponType.FIXED_AMOUNT,
      discountValue: 500,
      isActive: true,
      validFrom: new Date("2020-01-01T00:00:00Z"),
      usageCount: INITIAL_USAGE_COUNT,
    },
    select: { id: true },
  });

  const reservation = await prisma.reservation.create({
    data: {
      spaceId: space.id,
      customerId: customer.id,
      startTime,
      endTime,
      status: ReservationStatus.CONFIRMED,
      couponId: coupon.id,
      ...DEFAULT_RESERVATION_PRICING,
    },
    select: { id: true },
  });

  return {
    reservationId: reservation.id,
    couponId: coupon.id,
    cleanup: async () => {
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.coupon.deleteMany({ where: { id: coupon.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

describeMaybe("cancel × delete — クーポン usageCount はちょうど 1 減る", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ cancelReservationByToken } =
      await import("@/shared/domain/reservations/customer-commands"));
    ({ deleteReservationCommand } =
      await import("@/shared/domain/reservations/lifecycle-commands"));
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("CONFIRMED + クーポン予約へ cancel と delete を同時に投げても usageCount は 1 だけ減り、キャンセル claim は 1 回", async () => {
    const { reservationId, couponId, cleanup } =
      await createConfirmedReservationWithCoupon();

    try {
      const results = await Promise.allSettled([
        cancelReservationByToken(reservationId, 24, "都合により欠席"),
        deleteReservationCommand(reservationId, undefined, "管理者による削除"),
      ]);

      const cancelOutcome = results[0];
      const deleteOutcome = results[1];
      expect(cancelOutcome?.status).toBe("fulfilled");
      expect(deleteOutcome?.status).toBe("fulfilled");

      const cancelClaimed =
        cancelOutcome?.status === "fulfilled" &&
        cancelOutcome.value.success === true;
      const deleteClaimed =
        deleteOutcome?.status === "fulfilled" &&
        deleteOutcome.value.wasCancelled === true;

      // 片方だけが CANCELLED を claim する。両方が true だと副作用が二重。
      expect(Number(cancelClaimed) + Number(deleteClaimed)).toBe(1);

      const coupon = await prisma.coupon.findUniqueOrThrow({
        where: { id: couponId },
        select: { usageCount: true },
      });
      expect(coupon.usageCount).toBe(INITIAL_USAGE_COUNT - 1);

      const reservation = await prisma.reservation.findUniqueOrThrow({
        where: { id: reservationId },
        select: { status: true, deletedAt: true },
      });
      expect(reservation.status).toBe(ReservationStatus.CANCELLED);
      expect(reservation.deletedAt).not.toBeNull();
    } finally {
      await cleanup();
    }
  }, 30_000);
});
