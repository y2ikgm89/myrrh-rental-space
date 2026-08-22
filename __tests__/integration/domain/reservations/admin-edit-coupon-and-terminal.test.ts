/**
 * 管理者の予約編集が、終端ステータスと「再送されただけのクーポン」を正しく扱うことの検証。
 *
 * == なぜ要るのか ==
 *
 * `updateAdminReservationCommand` は 3 つの欠陥を同時に抱えていた（監査 F-58 / F-59 / F-60）。
 * どれも「クーポン行と予約行が実際にどうなったか」でしか確かめられない。
 *
 * - **F-58**: `ReservationEditForm` は `reservation.coupon?.code` を prefill して常に
 *   再送するのに、コマンドは毎回 `validateCoupon` を通していた。**クーポンを配り切る /
 *   有効期限が来る**という正常な運用の結果として、そのクーポンを使った全予約が
 *   管理画面から編集不能になる。文言は「無効なクーポンコードです」で、管理者が
 *   触ってすらいない項目を指す。
 * - **F-59**: 終端ステータスのガードが「遷移するとき」しか効かず、CANCELLED のまま
 *   保存できた。キャンセル時に解放済みの `usageCount` をもう一度 decrement するため、
 *   **他人の予約 1 件分の使用が帳簿から消える**（usageLimit=100 が 101 回使える）。
 * - **F-60**: 書込の `updateMany` に status 述語が無く、pre-read と tx の間に別経路
 *   （GCal 逆流 / mypage キャンセル / pending-expiry cron）が CANCELLED を書いても、
 *   それらは設計上 version を進めないので version 述語で検出できない。
 *   結果 CANCELLED が CONFIRMED へ戻り、`cancelledAt` / `cancellationReason` だけが残る。
 *
 * == 実行条件 ==
 *
 * 実 Postgres を要求する。`bun run test:integration` が test-db を用意する。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: () => Promise.resolve(),
}));

// 設定読み出しが `"use cache"` を通るので、Next の request scope 依存を外す。
mock.module("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
  unstable_cache: <T>(fn: T) => fn,
}));

/**
 * pre-read と tx の間に必ず走る seam。既定は素通しで、F-60 のテストだけが
 * 「この瞬間に別経路がキャンセルする」を差し込む。
 */
let beforeTransactionHook: (() => Promise<void>) | null = null;
const actualRatePlanQueries =
  await import("@/shared/domain/spaces/rate-plan-queries");
// `mock.module` は module registry ごと差し替えるので、namespace 越しに呼ぶと
// 自分自身を呼んで無限再帰する。**関数値を先に取り出しておく。**
const realGetSpaceRatePlans = actualRatePlanQueries.getSpaceRatePlans;
mock.module("@/shared/domain/spaces/rate-plan-queries", () => ({
  ...actualRatePlanQueries,
  getSpaceRatePlans: async (spaceId: string) => {
    const plans = await realGetSpaceRatePlans(spaceId);
    if (beforeTransactionHook) {
      const hook = beforeTransactionHook;
      beforeTransactionHook = null;
      await hook();
    }
    return plans;
  },
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type AdminCommandsModule =
  typeof import("@/shared/domain/reservations/admin-commands");
type EnumsModule = typeof import("@generated/prisma/enums");

let prisma: PrismaModule["prisma"];
let updateAdminReservationCommand: AdminCommandsModule["updateAdminReservationCommand"];
let PaymentStatus: EnumsModule["PaymentStatus"];
let ReservationStatus: EnumsModule["ReservationStatus"];

type ReservationStatusValue =
  EnumsModule["ReservationStatus"][keyof EnumsModule["ReservationStatus"]];

let nextSortOrder = 4_000_000 + Math.floor(Math.random() * 100_000);

type Fixture = {
  reservationId: string;
  spaceId: string;
  customerId: string;
  adminUserId: string;
  couponId: string;
  couponCode: string;
  cleanup: () => Promise<void>;
};

async function createFixture(opts: {
  readonly status: ReservationStatusValue;
  /** null なら期限切れにしない。 */
  readonly couponValidUntil: Date | null;
  readonly couponUsageCount: number;
}): Promise<Fixture> {
  const suffix = crypto.randomUUID();
  const short = suffix.replaceAll("-", "").slice(0, 10).toUpperCase();

  const location = await prisma.location.create({
    data: {
      slug: `admin-edit-loc-${suffix}`,
      name: `Admin Edit Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextSortOrder++,
    },
    select: { id: true },
  });
  const space = await prisma.space.create({
    data: {
      slug: `admin-edit-space-${suffix}`,
      name: `Admin Edit Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
      isActive: true,
    },
    select: { id: true },
  });
  const customer = await prisma.customer.create({
    data: {
      lastName: "山田",
      firstName: "太郎",
      email: `admin-edit-${suffix}@example.com`,
      emailCanonical: `admin-edit-${suffix}@example.com`,
    },
    select: { id: true },
  });
  const adminUser = await prisma.user.create({
    data: {
      email: `admin-edit-admin-${suffix}@example.com`,
      name: "管理者",
    },
    select: { id: true },
  });
  const coupon = await prisma.coupon.create({
    data: {
      code: `CPN${short}`,
      name: `Admin Edit Coupon ${suffix}`,
      type: "FIXED_AMOUNT",
      discountValue: 500,
      isActive: true,
      validFrom: new Date("2020-01-01T00:00:00Z"),
      validUntil: opts.couponValidUntil,
      usageCount: opts.couponUsageCount,
    },
    select: { id: true, code: true },
  });

  const reservation = await prisma.reservation.create({
    data: {
      customerId: customer.id,
      spaceId: space.id,
      startTime: new Date("2027-08-01T09:00:00+09:00"),
      endTime: new Date("2027-08-01T11:00:00+09:00"),
      status: opts.status,
      paymentStatus: PaymentStatus.UNPAID,
      totalPrice: 1500,
      basePrice: 2000,
      couponId: coupon.id,
      couponDiscountAmount: 500,
      taxRateType: "STANDARD",
      taxRate: 10,
      taxAmount: 150,
      totalPriceWithTax: 1650,
      rateBreakdownJson: {
        schemaVersion: 1,
        segments: [],
        totalHours: 0,
        totalBasePrice: 0,
        holidayFlags: {},
      },
    },
    select: { id: true },
  });

  return {
    reservationId: reservation.id,
    spaceId: space.id,
    customerId: customer.id,
    adminUserId: adminUser.id,
    couponId: coupon.id,
    couponCode: coupon.code,
    cleanup: async () => {
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.coupon.deleteMany({ where: { id: coupon.id } });
      await prisma.user.deleteMany({ where: { id: adminUser.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

function editInput(
  f: Fixture,
  overrides?: { status?: ReservationStatusValue },
) {
  return {
    spaceId: f.spaceId,
    customerId: f.customerId,
    date: "2027-08-01",
    startTime: "09:00",
    endTime: "11:00",
    status: overrides?.status ?? ReservationStatus.CONFIRMED,
    couponCode: f.couponCode,
    notes: "編集後のメモ",
    // Reservation.version の DB 既定は 0。fixture は作りっぱなしなので 0 のまま。
    version: 0,
    adminUserId: f.adminUserId,
  };
}

describeMaybe("管理者の予約編集: クーポン再送と終端ステータス", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ updateAdminReservationCommand } =
      await import("@/shared/domain/reservations/admin-commands"));
    ({ PaymentStatus, ReservationStatus } =
      await import("@generated/prisma/enums"));
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    beforeTransactionHook = null;
    await prisma.$disconnect();
  });

  // F-58
  test("期限切れクーポンが付いた予約でも、同じコードの再送なら保存できる", async () => {
    const f = await createFixture({
      status: ReservationStatus.CONFIRMED,
      couponValidUntil: new Date("2020-12-31T00:00:00Z"), // 期限切れ
      couponUsageCount: 1,
    });

    try {
      await updateAdminReservationCommand(f.reservationId, editInput(f));

      const after = await prisma.reservation.findUniqueOrThrow({
        where: { id: f.reservationId },
        select: { notes: true, couponId: true },
      });
      expect(after.notes).toBe("編集後のメモ");
      // クーポンは付いたまま。外れると割引が消えて総額が上がる。
      expect(after.couponId).toBe(f.couponId);
    } finally {
      await f.cleanup();
    }
  });

  // F-58（利用上限到達側）
  test("利用上限に達したクーポンでも、同じコードの再送なら保存できる", async () => {
    const f = await createFixture({
      status: ReservationStatus.CONFIRMED,
      couponValidUntil: null,
      couponUsageCount: 5,
    });
    await prisma.coupon.update({
      where: { id: f.couponId },
      data: { usageLimit: 5 },
    });

    try {
      await updateAdminReservationCommand(f.reservationId, editInput(f));

      const after = await prisma.reservation.findUniqueOrThrow({
        where: { id: f.reservationId },
        select: { notes: true, couponId: true },
      });
      expect(after.notes).toBe("編集後のメモ");
      expect(after.couponId).toBe(f.couponId);

      // 再送なので claim も release も走らない。
      const coupon = await prisma.coupon.findUniqueOrThrow({
        where: { id: f.couponId },
        select: { usageCount: true },
      });
      expect(coupon.usageCount).toBe(5);
    } finally {
      await f.cleanup();
    }
  });

  // F-59
  test("CANCELLED の予約は編集できない（usageCount を二重解放しない）", async () => {
    const f = await createFixture({
      status: ReservationStatus.CANCELLED,
      couponValidUntil: null,
      couponUsageCount: 50,
    });

    try {
      await expect(
        updateAdminReservationCommand(f.reservationId, {
          ...editInput(f),
          // クーポンを外す = 旧実装なら decrement が走る
          couponCode: "",
        }),
      ).rejects.toThrow(/編集できません/u);

      const coupon = await prisma.coupon.findUniqueOrThrow({
        where: { id: f.couponId },
        select: { usageCount: true },
      });
      expect(coupon.usageCount).toBe(50);
    } finally {
      await f.cleanup();
    }
  });

  // F-60
  test("保存直前に別経路がキャンセルした行を CONFIRMED へ戻さない", async () => {
    const f = await createFixture({
      status: ReservationStatus.CONFIRMED,
      couponValidUntil: null,
      couponUsageCount: 1,
    });

    // pre-read の後・tx の前に、GCal 逆流と同じ形で status だけを書き換える。
    // version は進めない（キャンセル経路は設計上 version を触らない）。
    beforeTransactionHook = async () => {
      await prisma.reservation.update({
        where: { id: f.reservationId },
        data: {
          status: ReservationStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: "カレンダーから削除されました",
        },
      });
    };

    try {
      await expect(
        updateAdminReservationCommand(f.reservationId, editInput(f)),
      ).rejects.toThrow(/別の画面で変更されました/u);

      const after = await prisma.reservation.findUniqueOrThrow({
        where: { id: f.reservationId },
        select: { status: true, cancellationReason: true },
      });
      expect(after.status).toBe(ReservationStatus.CANCELLED);
      expect(after.cancellationReason).toBe("カレンダーから削除されました");
    } finally {
      beforeTransactionHook = null;
      await f.cleanup();
    }
  });
});
