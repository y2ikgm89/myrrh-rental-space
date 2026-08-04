/**
 * EXCLUDE 制約 (`reservations_no_active_time_overlap_excl`) 違反時に
 * Prisma 7 + @prisma/adapter-pg が実際に投げるエラーの形状を実測して固定する。
 *
 * P2002 (unique constraint) は `PrismaClientKnownRequestError` にラップされるが、
 * 23P01 (exclusion violation) が同じ扱いを受けるかは未検証だった
 * (`src/shared/lib/prisma-errors.ts` の `isPrismaUniqueConstraintError` は
 * P2002 専用)。ここで実測した形状が `isPrismaExclusionConstraintError` の実装根拠になる。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type PrismaModule = typeof import("@/shared/db/prisma");
let prisma: PrismaModule["prisma"];

let nextSortOrder = 1_700_000_000;

describeMaybe("EXCLUDE 制約違反エラーの実測", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("23P01 の error 形状を記録する", async () => {
    const suffix = crypto.randomUUID();
    const location = await prisma.location.create({
      data: {
        slug: `excl-shape-loc-${suffix}`,
        name: `Excl Shape Loc ${suffix}`,
        address: "東京都テスト区1-2-3",
        imageUrl: "https://example.com/loc.jpg",
        sortOrder: nextSortOrder++,
      },
      select: { id: true },
    });
    const space = await prisma.space.create({
      data: {
        slug: `excl-shape-space-${suffix}`,
        name: `Excl Shape Space ${suffix}`,
        descriptionJson: {},
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
        email: `excl-shape-${suffix}@example.com`,
        emailCanonical: `excl-shape-${suffix}@example.com`,
      },
      select: { id: true },
    });

    const baseData = {
      spaceId: space.id,
      customerId: customer.id,
      basePrice: 1000,
      totalPrice: 1000,
      rateBreakdownJson: {
        schemaVersion: 1,
        segments: [],
        totalHours: 2,
        totalBasePrice: 1000,
        holidayFlags: {},
      },
      taxRateType: "STANDARD" as const,
      taxRate: 10,
      taxAmount: 100,
      totalPriceWithTax: 1100,
      guestLastName: "山田",
      guestFirstName: "太郎",
    };

    try {
      await prisma.reservation.create({
        data: {
          ...baseData,
          status: "CONFIRMED",
          startTime: new Date("2027-05-01T10:00:00.000Z"),
          endTime: new Date("2027-05-01T12:00:00.000Z"),
          guestEmail: `excl-shape-a-${suffix}@example.com`,
        },
      });

      let thrown: unknown = null;
      try {
        await prisma.reservation.create({
          data: {
            ...baseData,
            status: "PENDING",
            startTime: new Date("2027-05-01T11:00:00.000Z"),
            endTime: new Date("2027-05-01T13:00:00.000Z"),
            guestEmail: `excl-shape-b-${suffix}@example.com`,
          },
        });
      } catch (err) {
        thrown = err;
      }

      expect(thrown).not.toBeNull();
      const err = thrown as Record<string, unknown>;
      // 実測結果をそのまま記録する（診断目的）。
      console.log("[exclusion-violation-shape]", {
        constructorName: err.constructor?.name,
        name: (err as { name?: unknown }).name,
        code: (err as { code?: unknown }).code,
        message:
          typeof (err as { message?: unknown }).message === "string"
            ? (err as { message: string }).message.slice(0, 200)
            : undefined,
        ownKeys: Object.keys(err),
        cause: err["cause"],
        causeKeys: isRecordLike(err["cause"])
          ? Object.keys(err["cause"] as Record<string, unknown>)
          : undefined,
      });
    } finally {
      await prisma.reservation.deleteMany({ where: { spaceId: space.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    }
  });
});
