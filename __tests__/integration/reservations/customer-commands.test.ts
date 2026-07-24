/**
 * updateCustomerReservation — rate plan 統合の実 DB 統合テスト（Task 8）。
 *
 * customer-commands.ts に価格計算を伴う書込コマンドは updateCustomerReservation
 * のみ（新規予約は public-commands.ts の createPublicReservationCommand 経由）。
 * そのため各テストは「createPublicReservationCommand で予約を作成 →
 * updateCustomerReservation で変更」の 2 段階で構成する。
 *
 * next/cache のモック理由は public-commands.test.ts のコメントを参照
 * （cacheComponents ランタイム外で cacheLife/cacheTag/updateTag が throw するため）。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import {
  CouponType,
  DayOfWeek,
  HolidayMode,
  PaymentStatus,
  ReservationStatus,
} from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

mock.module("next/cache", () => ({
  cacheLife: () => undefined,
  cacheTag: () => undefined,
  updateTag: () => undefined,
  revalidateTag: () => undefined,
}));

// createPublicReservationCommand は isFeatureEnabled("reservation") を直接呼ぶ。
// CI seed で reservation feature が OFF の可能性を封じる。
mock.module("@/shared/lib/features/check", () => ({
  isFeatureEnabled: () => Promise.resolve(true),
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type PublicCommandsModule =
  typeof import("@/shared/domain/reservations/public-commands");
type CustomerCommandsModule =
  typeof import("@/shared/domain/reservations/customer-commands");
type PaymentQueriesModule =
  typeof import("@/shared/domain/reservations/payment-queries");
type RatePlanCommandsModule =
  typeof import("@/shared/domain/spaces/rate-plan-commands");
type RateBreakdownModule = typeof import("@/shared/lib/pricing/rate-breakdown");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let createPublicReservationCommand: PublicCommandsModule["createPublicReservationCommand"];
let updateCustomerReservation: CustomerCommandsModule["updateCustomerReservation"];
let cancelCustomerReservation: CustomerCommandsModule["cancelCustomerReservation"];
let claimReservationAsPaid: PaymentQueriesModule["claimReservationAsPaid"];
let createSpaceRatePlan: RatePlanCommandsModule["createSpaceRatePlan"];
let updateSpaceRatePlan: RatePlanCommandsModule["updateSpaceRatePlan"];
let rateBreakdownSchema: RateBreakdownModule["rateBreakdownSchema"];

// 2027-03-18 は木曜日、2027-03-19 は金曜日（固定 fixture）。
const THURSDAY_DATE = "2027-03-18";
const FRIDAY_DATE = "2027-03-19";
const MODIFICATION_DEADLINE_HOURS = 48;
const CANCEL_DEADLINE_HOURS = 24;

let nextFixtureLocationSortOrder = 1_500_000_000;

type SpaceFixture = {
  spaceId: string;
  hourlyPrice: number;
  cleanup: () => Promise<void>;
};

/** Location → Space を 1 件ずつ作る最小 fixture。 */
async function createSpaceFixture(hourlyPrice = 1000): Promise<SpaceFixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `customer-cmd-loc-${suffix}`,
      name: `Customer Cmd Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureLocationSortOrder++,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `customer-cmd-space-${suffix}`,
      name: `Customer Cmd Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
      // Space.isPublished は @default(false)。公開予約経路
      // (createPublicReservationCommand / updateCustomerReservation の
      // spaceForBlockedCheck・tx 内 space fetch) は isActive: true,
      // isPublished: true を要求するため明示指定する。
      isPublished: true,
      isActive: true,
    },
    select: { id: true },
  });

  return {
    spaceId: space.id,
    hourlyPrice,
    cleanup: async () => {
      await prisma.reservation.deleteMany({ where: { spaceId: space.id } });
      await prisma.spaceRatePlan.deleteMany({ where: { spaceId: space.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

/** Commerce / reservation singletons を既知値へ揃える（schema の @default と同値、他テストへの副作用ゼロ）。 */
async function ensureKnownSettings(): Promise<void> {
  const commerceData = {
    taxStandardRate: 10,
    taxReducedRate: 8,
    taxDisplayModePublic: "tax_included" as const,
    durationDiscountEnabled: false,
    durationDiscountRules: [],
    discountCombinationMode: "best" as const,
    showOriginalPrice: true,
  };
  const reservationData = {
    defaultTimeSlot: 60,
    minReservationDuration: 60,
    maxReservationDuration: 480,
  };
  await Promise.all([
    prisma.settingsCommerce.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...commerceData },
      update: commerceData,
    }),
    prisma.settingsReservation.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...reservationData },
      update: reservationData,
    }),
  ]);
}

async function createInitialReservation(
  spaceId: string,
  date: string,
): Promise<{ reservationId: string; customerId: string }> {
  const result = await createPublicReservationCommand({
    spaceId,
    date,
    startTime: "10:00",
    endTime: "12:00",
    lastName: "山田",
    firstName: "太郎",
    email: `customer-cmd-${crypto.randomUUID()}@example.com`,
  });
  return { reservationId: result.id, customerId: result.customerId };
}

type ReservationFixture = {
  reservationId: string;
  customerId: string;
  spaceId: string;
  date: string;
  cleanup: () => Promise<void>;
};

/**
 * optimistic concurrency (version) テスト用の予約 fixture。
 * Location → Space → Reservation を 1 件ずつ作る (createSpaceFixture +
 * createInitialReservation の合成)。Reservation.version は schema
 * `@default(0)` のため常に 0 で作成される。`opts.version` は呼出側の意図明示用
 * (現状 0 以外はサポートしない — fresh reservation は必ず version=0 で始まる)。
 */
async function createReservationFixture(opts?: {
  version?: number;
}): Promise<ReservationFixture> {
  if (opts?.version !== undefined && opts.version !== 0) {
    throw new Error(
      "createReservationFixture は version: 0 のみサポート (新規予約は常に version=0 で作成される)",
    );
  }
  const { spaceId, cleanup } = await createSpaceFixture(1000);
  const { reservationId, customerId } = await createInitialReservation(
    spaceId,
    FRIDAY_DATE,
  );
  return {
    reservationId,
    customerId,
    spaceId,
    date: FRIDAY_DATE,
    cleanup,
  };
}

describeMaybe("updateCustomerReservation — rate plan 統合", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ createPublicReservationCommand } =
      await import("@/shared/domain/reservations/public-commands"));
    ({ updateCustomerReservation, cancelCustomerReservation } =
      await import("@/shared/domain/reservations/customer-commands"));
    ({ claimReservationAsPaid } =
      await import("@/shared/domain/reservations/payment-queries"));
    ({ createSpaceRatePlan, updateSpaceRatePlan } =
      await import("@/shared/domain/spaces/rate-plan-commands"));
    ({ rateBreakdownSchema } =
      await import("@/shared/lib/pricing/rate-breakdown"));
    await prisma.$queryRaw`SELECT 1`;
    await ensureKnownSettings();
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("rate plan なしで従来通り予約変更できる (regression)", async () => {
    const { spaceId, hourlyPrice, cleanup } = await createSpaceFixture(1000);
    try {
      const { reservationId, customerId } = await createInitialReservation(
        spaceId,
        FRIDAY_DATE,
      );

      // 同日内で時間帯だけ変更（rate plan は未設定のまま）。
      const updateResult = await updateCustomerReservation(
        reservationId,
        customerId,
        {
          spaceId,
          date: FRIDAY_DATE,
          startTime: "14:00",
          endTime: "16:00",
          version: 0,
        },
        MODIFICATION_DEADLINE_HOURS,
      );
      expect(updateResult.success).toBe(true);

      const reservation = await prisma.reservation.findUniqueOrThrow({
        where: { id: reservationId },
      });
      const rateBreakdown = rateBreakdownSchema.parse(
        reservation.rateBreakdownJson,
      );

      expect(rateBreakdown.segments[0]?.hourlyPrice).toBe(hourlyPrice);
      expect(rateBreakdown.segments[0]?.ratePlanId).toBeNull();
      expect(reservation.basePrice).toBe(2000); // 1000 × 2h
      expect(reservation.totalPrice).toBe(2000);

      // totalPrice は NOT NULL 列だが result 拡張の型は number | null
      // (decimalToNumber の防御的シグネチャ) のため明示的に narrow する。
      if (reservation.totalPrice === null) {
        throw new Error("totalPrice must not be null");
      }
      const expectedTaxAmount = Math.round((reservation.totalPrice * 10) / 100);
      expect(reservation.taxAmount).toBe(expectedTaxAmount);
      expect(reservation.totalPriceWithTax).toBe(
        reservation.totalPrice + expectedTaxAmount,
      );
    } finally {
      await cleanup();
    }
  });

  test("曜日別 rate plan が適用される", async () => {
    const { spaceId, cleanup } = await createSpaceFixture(1000);
    try {
      // 予約作成時点では rate plan 未設定（木曜日、基本料金 1000）。
      const { reservationId, customerId } = await createInitialReservation(
        spaceId,
        THURSDAY_DATE,
      );

      // 作成後に金曜特別料金の rate plan を追加。
      const plan = await createSpaceRatePlan({
        spaceId,
        name: "金曜特別料金",
        hourlyPrice: 2000,
        daysOfWeek: [DayOfWeek.FRIDAY],
        holidayMode: HolidayMode.any,
        startTime: null,
        endTime: null,
        effectiveFrom: null,
        effectiveTo: null,
      });

      // 金曜日へ変更 → 変更時点の最新 rate plan が適用されるべき。
      const updateResult = await updateCustomerReservation(
        reservationId,
        customerId,
        {
          spaceId,
          date: FRIDAY_DATE,
          startTime: "10:00",
          endTime: "12:00",
          version: 0,
        },
        MODIFICATION_DEADLINE_HOURS,
      );
      expect(updateResult.success).toBe(true);

      const reservation = await prisma.reservation.findUniqueOrThrow({
        where: { id: reservationId },
      });
      const rateBreakdown = rateBreakdownSchema.parse(
        reservation.rateBreakdownJson,
      );

      expect(rateBreakdown.segments[0]?.ratePlanId).toBe(plan.id);
      expect(rateBreakdown.segments[0]?.hourlyPrice).toBe(2000);
      expect(reservation.basePrice).toBe(4000); // 2000 × 2h
      expect(reservation.totalPrice).toBe(4000);
    } finally {
      await cleanup();
    }
  });

  test("validUntil=null の永続クーポンが time/space セルフ変更後も維持される", async () => {
    // Regression: customer-commands.ts の couponForCalc 条件が旧実装で
    // `coupon.validUntil &&` を要求しており、Coupon.validUntil が null（永続クーポン）
    // の場合に short-circuit で null になっていた。結果 `couponId: ... : null` で
    // FK が silently drop され、顧客がセルフ変更するだけで恒久的にクーポンが外れていた。
    // validateCoupon (payloads.ts:127-131) と同じ「`!validUntil || >= end`」意味論に
    // 揃わせるための regression test。
    const { spaceId, cleanup } = await createSpaceFixture(1000);
    const couponCode = `PERM${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
    const coupon = await prisma.coupon.create({
      data: {
        code: couponCode,
        name: `Perm coupon ${couponCode}`,
        type: CouponType.PERCENTAGE,
        discountValue: 10, // 10% off
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        validUntil: null, // 永続クーポン（バグの発火条件）
        usageLimit: null,
        usageCount: 0,
        isActive: true,
        canCombineWithDurationDiscount: true,
      },
      select: { id: true, code: true },
    });
    try {
      // クーポン付きで予約作成（10:00-12:00 = 2h × 1000 = 2000, 10% off = 1800）。
      const created = await createPublicReservationCommand({
        spaceId,
        date: FRIDAY_DATE,
        startTime: "10:00",
        endTime: "12:00",
        lastName: "山田",
        firstName: "花子",
        email: `customer-cmd-perm-${crypto.randomUUID()}@example.com`,
        couponCode: coupon.code,
      });
      const before = await prisma.reservation.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(before.couponId).toBe(coupon.id);
      expect(before.couponDiscountAmount).toBeGreaterThan(0);

      // 顧客が time だけセルフ変更（クーポン操作なし）。
      const updateResult = await updateCustomerReservation(
        created.id,
        created.customerId,
        {
          spaceId,
          date: FRIDAY_DATE,
          startTime: "14:00",
          endTime: "16:00",
          version: 0,
        },
        MODIFICATION_DEADLINE_HOURS,
      );
      expect(updateResult.success).toBe(true);

      const after = await prisma.reservation.findUniqueOrThrow({
        where: { id: created.id },
      });
      // couponId が silently drop されないこと（真のバグ）。
      expect(after.couponId).toBe(coupon.id);
      // クーポン割引額が 0 に戻らず再計算後も適用されていること。
      // basePrice/couponDiscountAmount は NOT NULL 列だが result 拡張の型は
      // number | null（decimalToNumber の防御的シグネチャ）のため narrow する。
      if (after.basePrice === null || after.couponDiscountAmount === null) {
        throw new Error(
          "basePrice / couponDiscountAmount must not be null after reprice",
        );
      }
      expect(after.couponDiscountAmount).toBeGreaterThan(0);
      // basePrice は 2h × 1000 で不変、totalPrice は couponDiscount 適用済み。
      expect(after.basePrice).toBe(2000);
      expect(after.totalPrice).toBe(
        after.basePrice - after.couponDiscountAmount,
      );
    } finally {
      await prisma.reservation.deleteMany({ where: { couponId: coupon.id } });
      await prisma.coupon.deleteMany({ where: { id: coupon.id } });
      await cleanup();
    }
  });

  test("rate plan 変更後も既存予約の rateBreakdownJson が snapshot として不変", async () => {
    const { spaceId, cleanup } = await createSpaceFixture(1000);
    try {
      const plan = await createSpaceRatePlan({
        spaceId,
        name: "金曜特別料金",
        hourlyPrice: 2000,
        daysOfWeek: [DayOfWeek.FRIDAY],
        holidayMode: HolidayMode.any,
        startTime: null,
        endTime: null,
        effectiveFrom: null,
        effectiveTo: null,
      });

      const { reservationId, customerId } = await createInitialReservation(
        spaceId,
        FRIDAY_DATE,
      );

      // updateCustomerReservation を一度実行し、その時点の rate plan (2000) で
      // スナップショットを確定させる（時間帯のみ変更、rate plan は変えない）。
      const updateResult = await updateCustomerReservation(
        reservationId,
        customerId,
        {
          spaceId,
          date: FRIDAY_DATE,
          startTime: "10:30",
          endTime: "12:30",
          version: 0,
        },
        MODIFICATION_DEADLINE_HOURS,
      );
      expect(updateResult.success).toBe(true);

      const before = await prisma.reservation.findUniqueOrThrow({
        where: { id: reservationId },
      });

      // rate plan 自体の単価を変更（予約は再変更しない）。
      await updateSpaceRatePlan(plan.id, { hourlyPrice: 9999 });

      const after = await prisma.reservation.findUniqueOrThrow({
        where: { id: reservationId },
      });

      expect(after.rateBreakdownJson).toEqual(before.rateBreakdownJson);
      expect(after.basePrice).toBe(before.basePrice);
      expect(after.totalPrice).toBe(before.totalPrice);
    } finally {
      await cleanup();
    }
  });

  describe("optimistic concurrency (version)", () => {
    test("regression: 単発 update で version が 0 → 1 に increment", async () => {
      const fixture = await createReservationFixture({ version: 0 });
      try {
        const result = await updateCustomerReservation(
          fixture.reservationId,
          fixture.customerId,
          {
            spaceId: fixture.spaceId,
            date: fixture.date,
            startTime: "10:00",
            endTime: "11:00",
            version: 0,
          },
          MODIFICATION_DEADLINE_HOURS,
        );
        expect(result.success).toBe(true);
        const after = await prisma.reservation.findUniqueOrThrow({
          where: { id: fixture.reservationId },
          select: { version: true },
        });
        expect(after.version).toBe(1);
      } finally {
        await fixture.cleanup();
      }
    });

    test("customer タブ間 race: 同じ version=0 の 2 update で 1 succeed / 1 CONFLICT", async () => {
      const fixture = await createReservationFixture({ version: 0 });
      try {
        const [firstResult, secondResult] = await Promise.all([
          updateCustomerReservation(
            fixture.reservationId,
            fixture.customerId,
            {
              spaceId: fixture.spaceId,
              date: fixture.date,
              startTime: "10:00",
              endTime: "11:00",
              version: 0,
            },
            MODIFICATION_DEADLINE_HOURS,
          ),
          updateCustomerReservation(
            fixture.reservationId,
            fixture.customerId,
            {
              spaceId: fixture.spaceId,
              date: fixture.date,
              startTime: "14:00",
              endTime: "15:00",
              version: 0,
            },
            MODIFICATION_DEADLINE_HOURS,
          ),
        ]);

        const successes = [firstResult, secondResult].filter((r) => r.success);
        const failures = [firstResult, secondResult].filter((r) => !r.success);
        expect(successes).toHaveLength(1);
        expect(failures).toHaveLength(1);
        expect(failures[0]!.success ? "" : failures[0]!.error).toContain(
          "予約情報が別のデバイスまたはタブで変更されました",
        );
      } finally {
        await fixture.cleanup();
      }
    });

    test("再試行: conflict 後、最新 version=1 で再 submit → 成功", async () => {
      const fixture = await createReservationFixture({ version: 0 });
      try {
        // 1 回目: version=0 で成功
        const first = await updateCustomerReservation(
          fixture.reservationId,
          fixture.customerId,
          {
            spaceId: fixture.spaceId,
            date: fixture.date,
            startTime: "10:00",
            endTime: "11:00",
            version: 0,
          },
          MODIFICATION_DEADLINE_HOURS,
        );
        expect(first.success).toBe(true);

        // 2 回目: 古い version=0 で conflict
        const stale = await updateCustomerReservation(
          fixture.reservationId,
          fixture.customerId,
          {
            spaceId: fixture.spaceId,
            date: fixture.date,
            startTime: "14:00",
            endTime: "15:00",
            version: 0,
          },
          MODIFICATION_DEADLINE_HOURS,
        );
        expect(stale.success).toBe(false);

        // 3 回目: 最新 version=1 で成功
        const retry = await updateCustomerReservation(
          fixture.reservationId,
          fixture.customerId,
          {
            spaceId: fixture.spaceId,
            date: fixture.date,
            startTime: "14:00",
            endTime: "15:00",
            version: 1,
          },
          MODIFICATION_DEADLINE_HOURS,
        );
        expect(retry.success).toBe(true);
      } finally {
        await fixture.cleanup();
      }
    });
  });

  describe("非 form path は version を touch しない (spec §3.1.1 gate)", () => {
    test("cancel-core (cancelCustomerReservation) 経由の書込後、version は不変", async () => {
      const fixture = await createReservationFixture({ version: 0 });
      try {
        // まず form path で version を 0 → 1 に進める
        const updateResult = await updateCustomerReservation(
          fixture.reservationId,
          fixture.customerId,
          {
            spaceId: fixture.spaceId,
            date: fixture.date,
            startTime: "10:00",
            endTime: "11:00",
            version: 0,
          },
          MODIFICATION_DEADLINE_HOURS,
        );
        expect(updateResult.success).toBe(true);
        const beforeCancel = await prisma.reservation.findUniqueOrThrow({
          where: { id: fixture.reservationId },
          select: { version: true },
        });
        expect(beforeCancel.version).toBe(1);

        // cancel-core (非 form path) 実行。applyCancellation は version を
        // WHERE 述語にも SET 句にも含まない (icsSequence のみ increment)。
        const cancelResult = await cancelCustomerReservation(
          fixture.reservationId,
          fixture.customerId,
          CANCEL_DEADLINE_HOURS,
          "test cancel",
        );
        expect(cancelResult.success).toBe(true);

        const afterCancel = await prisma.reservation.findUniqueOrThrow({
          where: { id: fixture.reservationId },
          select: { version: true, status: true },
        });
        expect(afterCancel.status).toBe(ReservationStatus.CANCELLED);
        expect(afterCancel.version).toBe(1); // 不変
      } finally {
        await fixture.cleanup();
      }
    });

    test("claimReservationAsPaid (非 form path、webhook 由来の paymentStatus 遷移) 経由でも version は不変", async () => {
      const fixture = await createReservationFixture({ version: 0 });
      try {
        // createPublicReservationCommand は status=CONFIRMED / paymentStatus=UNPAID
        // (schema @default) で作成する。claimReservationAsPaid は Stripe webhook
        // (checkout.session.completed) から呼ばれる想定の atomic claim で、
        // WHERE/SET のいずれにも version を含めない。
        const claimed = await claimReservationAsPaid(fixture.reservationId, {
          stripePaymentIntentId: null,
        });
        expect(claimed).not.toBeNull();
        expect(claimed?.paymentStatus).toBe(PaymentStatus.PAID);

        const after = await prisma.reservation.findUniqueOrThrow({
          where: { id: fixture.reservationId },
          select: { version: true },
        });
        expect(after.version).toBe(0); // 不変
      } finally {
        await fixture.cleanup();
      }
    });
  });
});
