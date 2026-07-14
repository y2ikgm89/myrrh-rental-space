/**
 * createAdminReservationCommand — rate plan 統合 + admin override policy の
 * 実 DB 統合テスト（Task 8）。
 *
 * next/cache のモック理由は public-commands.test.ts のコメントを参照
 * （cacheComponents ランタイム外で cacheLife/cacheTag/updateTag が throw するため）。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { TaxRateType, DayOfWeek, HolidayMode } from "@generated/prisma/enums";

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

type PrismaModule = typeof import("@/shared/db/prisma");
type AdminCommandsModule =
  typeof import("@/shared/domain/reservations/admin-commands");
type RatePlanCommandsModule =
  typeof import("@/shared/domain/spaces/rate-plan-commands");
type RateBreakdownModule = typeof import("@/shared/lib/pricing/rate-breakdown");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let createAdminReservationCommand: AdminCommandsModule["createAdminReservationCommand"];
let updateAdminReservationCommand: AdminCommandsModule["updateAdminReservationCommand"];
let createSpaceRatePlan: RatePlanCommandsModule["createSpaceRatePlan"];
let updateSpaceRatePlan: RatePlanCommandsModule["updateSpaceRatePlan"];
let rateBreakdownSchema: RateBreakdownModule["rateBreakdownSchema"];

// 2027-03-19 は金曜日（固定 fixture、rate plan の曜日マッチを検証するため）。
const FRIDAY_DATE = "2027-03-19";
const ADMIN_USER_ID = "00000000-0000-4000-9000-000000000001";
const OTHER_ADMIN_USER_ID = "00000000-0000-4000-9000-000000000002";

let nextFixtureLocationSortOrder = 1_450_000_000;

type SpaceFixture = {
  spaceId: string;
  hourlyPrice: number;
  customerId: string;
  cleanup: () => Promise<void>;
};

/** Location → Space → Customer を 1 件ずつ作る最小 fixture。 */
async function createSpaceFixture(hourlyPrice = 1000): Promise<SpaceFixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `admin-cmd-loc-${suffix}`,
      name: `Admin Cmd Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureLocationSortOrder++,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `admin-cmd-space-${suffix}`,
      name: `Admin Cmd Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
      // Space.isPublished は @default(false)。admin 経路は isPublished を
      // 要求しないが、他 2 経路のテストとの一貫性のため明示指定する。
      isPublished: true,
      isActive: true,
    },
    select: { id: true },
  });

  const customer = await prisma.customer.create({
    data: {
      lastName: "管理",
      firstName: "顧客",
      email: `admin-cmd-${suffix}@example.com`,
      emailCanonical: `admin-cmd-${suffix}@example.com`,
    },
    select: { id: true },
  });

  return {
    spaceId: space.id,
    hourlyPrice,
    customerId: customer.id,
    cleanup: async () => {
      await prisma.reservation.deleteMany({ where: { spaceId: space.id } });
      await prisma.spaceRatePlan.deleteMany({ where: { spaceId: space.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

/** Settings singleton を既知値へ揃える（schema の @default と同値、他テストへの副作用ゼロ）。 */
async function ensureKnownSettings(): Promise<void> {
  const data = {
    taxStandardRate: 10,
    taxReducedRate: 8,
    taxDisplayModePublic: "tax_included" as const,
    durationDiscountEnabled: false,
    durationDiscountRules: [],
    discountCombinationMode: "best" as const,
    showOriginalPrice: true,
    // 2 時間の fixture 予約が確実に通るよう、期間ルールも既知値へ揃える
    // (schema の @default と同値。共有ローカル test-db コンテナに他テストの
    // 残留値が入っていても揺れないようにするための明示指定)。
    defaultTimeSlot: 60,
    minReservationDuration: 60,
    maxReservationDuration: 480,
  };
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}

describeMaybe(
  "createAdminReservationCommand — rate plan 統合 + override policy",
  () => {
    beforeAll(async () => {
      ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
      ({ createAdminReservationCommand, updateAdminReservationCommand } =
        await import("@/shared/domain/reservations/admin-commands"));
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

    test("rate plan なしで従来通り予約作成できる (regression)", async () => {
      const { spaceId, hourlyPrice, customerId, cleanup } =
        await createSpaceFixture(1000);
      try {
        const result = await createAdminReservationCommand({
          spaceId,
          date: FRIDAY_DATE,
          startTime: "10:00",
          endTime: "12:00",
          customerId,
          status: "CONFIRMED",
          adminUserId: ADMIN_USER_ID,
        });

        const reservation = await prisma.reservation.findUniqueOrThrow({
          where: { id: result.id },
        });
        const rateBreakdown = rateBreakdownSchema.parse(
          reservation.rateBreakdownJson,
        );

        expect(rateBreakdown.segments[0]?.hourlyPrice).toBe(hourlyPrice);
        expect(rateBreakdown.segments[0]?.ratePlanId).toBeNull();

        expect(reservation.taxRateType).toBe(TaxRateType.standard);
        expect(reservation.taxRate).toBe(10);

        // totalPrice は NOT NULL 列だが result 拡張の型は number | null
        // (decimalToNumber の防御的シグネチャ) のため明示的に narrow する。
        if (reservation.totalPrice === null) {
          throw new Error("totalPrice must not be null");
        }
        const expectedTaxAmount = Math.round(
          (reservation.totalPrice * 10) / 100,
        );
        expect(reservation.taxAmount).toBe(expectedTaxAmount);
        expect(reservation.totalPriceWithTax).toBe(
          reservation.totalPrice + expectedTaxAmount,
        );
        expect(reservation.priceOverriddenBy).toBeNull();
      } finally {
        await cleanup();
      }
    });

    test("曜日別 rate plan が適用される", async () => {
      const { spaceId, customerId, cleanup } = await createSpaceFixture(1000);
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

        const result = await createAdminReservationCommand({
          spaceId,
          date: FRIDAY_DATE,
          startTime: "10:00",
          endTime: "12:00",
          customerId,
          status: "CONFIRMED",
          adminUserId: ADMIN_USER_ID,
        });

        const reservation = await prisma.reservation.findUniqueOrThrow({
          where: { id: result.id },
        });
        const rateBreakdown = rateBreakdownSchema.parse(
          reservation.rateBreakdownJson,
        );

        expect(rateBreakdown.segments[0]?.ratePlanId).toBe(plan.id);
        expect(rateBreakdown.segments[0]?.hourlyPrice).toBe(2000);
        // hourlyPrice=2000（rate plan）× 2h = 4000（space の基本料金 1000 ではない）
        expect(reservation.basePrice).toBe(4000);
        expect(reservation.totalPrice).toBe(4000);
      } finally {
        await cleanup();
      }
    });

    test("rate plan 変更後も既存予約の rateBreakdownJson が snapshot として不変", async () => {
      const { spaceId, customerId, cleanup } = await createSpaceFixture(1000);
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

        const result = await createAdminReservationCommand({
          spaceId,
          date: FRIDAY_DATE,
          startTime: "10:00",
          endTime: "12:00",
          customerId,
          status: "CONFIRMED",
          adminUserId: ADMIN_USER_ID,
        });

        const before = await prisma.reservation.findUniqueOrThrow({
          where: { id: result.id },
        });

        await updateSpaceRatePlan(plan.id, { hourlyPrice: 9999 });

        const after = await prisma.reservation.findUniqueOrThrow({
          where: { id: result.id },
        });

        expect(after.rateBreakdownJson).toEqual(before.rateBreakdownJson);
        expect(after.basePrice).toBe(before.basePrice);
        expect(after.totalPrice).toBe(before.totalPrice);
      } finally {
        await cleanup();
      }
    });

    test("admin override: totalPrice のみ上書き、rateBreakdownJson.segments は保持", async () => {
      const { spaceId, customerId, cleanup } = await createSpaceFixture(1000);
      try {
        const result = await createAdminReservationCommand({
          spaceId,
          date: FRIDAY_DATE,
          startTime: "10:00",
          endTime: "12:00",
          customerId,
          status: "CONFIRMED",
          totalPrice: 10000, // override（計算値は 2000 = 1000×2h）
          adminUserId: ADMIN_USER_ID,
        });

        const reservation = await prisma.reservation.findUniqueOrThrow({
          where: { id: result.id },
        });
        const rateBreakdown = rateBreakdownSchema.parse(
          reservation.rateBreakdownJson,
        );

        expect(reservation.totalPrice).toBe(10000);
        // rateBreakdownJson は override 前の rate 解決結果のスナップショットのまま
        // （override は totalPrice/taxAmount/totalPriceWithTax のみに作用する）。
        expect(rateBreakdown.segments.length).toBeGreaterThan(0);
        expect(reservation.basePrice).toBe(2000);
        // 税は override 後の totalPrice から派生: 10000 × 10% = 1000
        expect(reservation.taxAmount).toBe(1000);
        expect(reservation.totalPriceWithTax).toBe(11000);
        expect(reservation.priceOverriddenBy).toBe(ADMIN_USER_ID);
      } finally {
        await cleanup();
      }
    });

    test("admin override (update): totalPrice のみ上書き、税は作成時点の taxRate スナップショットから派生", async () => {
      const { spaceId, customerId, cleanup } = await createSpaceFixture(1000);
      try {
        // override なしで作成: totalPrice=2000（1000×2h）、taxRate snapshot=10%
        const created = await createAdminReservationCommand({
          spaceId,
          date: FRIDAY_DATE,
          startTime: "10:00",
          endTime: "12:00",
          customerId,
          status: "CONFIRMED",
          adminUserId: ADMIN_USER_ID,
        });

        // 別の管理者が update で totalPrice を override。
        const updateResult = await updateAdminReservationCommand(created.id, {
          spaceId,
          date: FRIDAY_DATE,
          startTime: "10:00",
          endTime: "12:00",
          customerId,
          status: "CONFIRMED",
          totalPrice: 5000, // override
          adminUserId: OTHER_ADMIN_USER_ID,
        });
        expect(updateResult.payload.reservationId).toBe(created.id);

        const reservation = await prisma.reservation.findUniqueOrThrow({
          where: { id: created.id },
        });

        expect(reservation.totalPrice).toBe(5000);
        // taxRate 自体は作成時点のスナップショット (10%) のまま
        // (update は totalPrice を書き換えても taxRate/taxRateType は変更しない方針)。
        expect(reservation.taxRate).toBe(10);
        expect(reservation.taxAmount).toBe(500); // 5000 × 10% = 500
        expect(reservation.totalPriceWithTax).toBe(5500);
        expect(reservation.priceOverriddenBy).toBe(OTHER_ADMIN_USER_ID);
      } finally {
        await cleanup();
      }
    });
  },
);
