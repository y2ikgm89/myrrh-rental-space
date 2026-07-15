/**
 * createPublicReservationCommand — rate plan 統合の実 DB 統合テスト（Task 8）。
 *
 * 実 Postgres を要求する（rate plan 解決結果の DB 永続化・Settings 税率の適用を
 * 実際の Prisma 型・DB 制約で検証するため mock では代替できない）。
 * `bun run test:integration` は docker-compose の test-db 既定値を注入する。直接
 * `bun test` でこのファイルを実行し `TEST_DATABASE_URL` が未設定の場合のみ
 * describe ごと skip する（dev DB を誤って汚染しないための安全弁、
 * space-overlap-concurrency.test.ts と同型）。
 *
 * `getSpaceRatePlans`（rate-plan-queries.ts）は `"use cache"` + cacheLife/cacheTag
 * (next/cache) を使う。Next.js の cacheComponents ランタイム外（この bun test
 * プロセス）では `cacheLife()`/`cacheTag()` が必ず throw するため、next/cache を
 * no-op でモックする（rate plan の DB 読み取り自体は実 Prisma のまま — キャッシュ
 * 機構だけを無効化する）。`createSpaceRatePlan`/`updateSpaceRatePlan` が呼ぶ
 * `updateTag`（Server Action 専用、それ以外のコンテキストで throw）も同じ理由で
 * 一緒にモックする。
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

// createPublicReservationCommand は isFeatureEnabled("reservation") を直接呼ぶ。
// CI seed で reservation feature が OFF の可能性を封じる。
mock.module("@/shared/lib/features/check", () => ({
  isFeatureEnabled: () => Promise.resolve(true),
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type PublicCommandsModule =
  typeof import("@/shared/domain/reservations/public-commands");
type RatePlanCommandsModule =
  typeof import("@/shared/domain/spaces/rate-plan-commands");
type RateBreakdownModule = typeof import("@/shared/lib/pricing/rate-breakdown");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let createPublicReservationCommand: PublicCommandsModule["createPublicReservationCommand"];
let createSpaceRatePlan: RatePlanCommandsModule["createSpaceRatePlan"];
let updateSpaceRatePlan: RatePlanCommandsModule["updateSpaceRatePlan"];
let rateBreakdownSchema: RateBreakdownModule["rateBreakdownSchema"];

// 2027-03-19 は金曜日（固定 fixture、rate plan の曜日マッチを検証するため）。
const FRIDAY_DATE = "2027-03-19";

let nextFixtureLocationSortOrder = 1_400_000_000;

type SpaceFixture = {
  spaceId: string;
  hourlyPrice: number;
  cleanup: () => Promise<void>;
};

/** Location → Space を 1 件ずつ作る最小 fixture（顧客は command 内で自動作成される）。 */
async function createSpaceFixture(hourlyPrice = 1000): Promise<SpaceFixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `public-cmd-loc-${suffix}`,
      name: `Public Cmd Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureLocationSortOrder++,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `public-cmd-space-${suffix}`,
      name: `Public Cmd Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
      // Space.isPublished は @default(false)。公開予約経路は
      // isActive: true, isPublished: true を要求するため明示指定する。
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

/**
 * Settings singleton を既知値へ揃える（schema の @default と同値なので他テストへの
 * 副作用ゼロ。real-DB serial bucket は同時に 1 ファイルしか走らないため race もない
 * — .claude/rules/testing-unit.md 参照）。
 */
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

function guestInput(spaceId: string) {
  return {
    spaceId,
    date: FRIDAY_DATE,
    startTime: "10:00",
    endTime: "12:00",
    lastName: "山田",
    firstName: "太郎",
    email: `public-cmd-${crypto.randomUUID()}@example.com`,
  };
}

describeMaybe("createPublicReservationCommand — rate plan 統合", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ createPublicReservationCommand } =
      await import("@/shared/domain/reservations/public-commands"));
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
    const { spaceId, hourlyPrice, cleanup } = await createSpaceFixture(1000);
    try {
      const result = await createPublicReservationCommand(guestInput(spaceId));

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

      const result = await createPublicReservationCommand(guestInput(spaceId));

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

      const result = await createPublicReservationCommand(guestInput(spaceId));

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
});
