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
import { DayOfWeek, HolidayMode } from "@generated/prisma/enums";

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
type RatePlanCommandsModule =
  typeof import("@/shared/domain/spaces/rate-plan-commands");
type RateBreakdownModule = typeof import("@/shared/lib/pricing/rate-breakdown");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let createPublicReservationCommand: PublicCommandsModule["createPublicReservationCommand"];
let updateCustomerReservation: CustomerCommandsModule["updateCustomerReservation"];
let createSpaceRatePlan: RatePlanCommandsModule["createSpaceRatePlan"];
let updateSpaceRatePlan: RatePlanCommandsModule["updateSpaceRatePlan"];
let rateBreakdownSchema: RateBreakdownModule["rateBreakdownSchema"];

// 2027-03-18 は木曜日、2027-03-19 は金曜日（固定 fixture）。
const THURSDAY_DATE = "2027-03-18";
const FRIDAY_DATE = "2027-03-19";
const MODIFICATION_DEADLINE_HOURS = 48;

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

describeMaybe("updateCustomerReservation — rate plan 統合", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ createPublicReservationCommand } =
      await import("@/shared/domain/reservations/public-commands"));
    ({ updateCustomerReservation } =
      await import("@/shared/domain/reservations/customer-commands"));
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
});
