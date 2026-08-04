/**
 * deleteSpaceCommand / bulkDeleteSpacesCommand の占有判定 predicate 実 DB 回帰テスト。
 *
 * 修正前は予約側の占有チェックに `deletedAt: null` が無く、CONFIRMED のまま
 * soft-delete された予約（`reservation.deletedAt` が非 null）が残っていると、
 * 実際には占有していないにもかかわらず Space 削除が永久にブロックされていた
 * （直後の Event 側チェックには既に `deletedAt: null` があり、predicate が
 * 非対称だった）。
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

type PrismaModule = typeof import("@/shared/db/prisma");
type SpacesCommandsModule = typeof import("@/shared/domain/spaces/commands");
type BulkCommandsModule = typeof import("@/shared/domain/spaces/bulk-commands");

let prisma: PrismaModule["prisma"];
let deleteSpaceCommand: SpacesCommandsModule["deleteSpaceCommand"];
let bulkDeleteSpacesCommand: BulkCommandsModule["bulkDeleteSpacesCommand"];

let nextSortOrder = 1_800_000_000;

async function createSpaceFixture(): Promise<{
  spaceId: string;
  customerId: string;
  cleanup: () => Promise<void>;
}> {
  const suffix = crypto.randomUUID();
  const location = await prisma.location.create({
    data: {
      slug: `soft-del-loc-${suffix}`,
      name: `Soft Del Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextSortOrder++,
    },
    select: { id: true },
  });
  const space = await prisma.space.create({
    data: {
      slug: `soft-del-space-${suffix}`,
      name: `Soft Del Space ${suffix}`,
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
      email: `soft-del-${suffix}@example.com`,
      emailCanonical: `soft-del-${suffix}@example.com`,
    },
    select: { id: true },
  });

  return {
    spaceId: space.id,
    customerId: customer.id,
    cleanup: async () => {
      await prisma.reservation.deleteMany({ where: { spaceId: space.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

async function createSoftDeletedConfirmedReservation(params: {
  spaceId: string;
  customerId: string;
}): Promise<string> {
  const reservation = await prisma.reservation.create({
    data: {
      spaceId: params.spaceId,
      customerId: params.customerId,
      status: "CONFIRMED",
      paymentStatus: "UNPAID",
      startTime: new Date("2027-06-01T10:00:00.000Z"),
      endTime: new Date("2027-06-01T12:00:00.000Z"),
      basePrice: 1000,
      totalPrice: 1000,
      rateBreakdownJson: {
        schemaVersion: 1,
        segments: [],
        totalHours: 2,
        totalBasePrice: 1000,
        holidayFlags: {},
      },
      taxRateType: "STANDARD",
      taxRate: 10,
      taxAmount: 100,
      totalPriceWithTax: 1100,
      guestLastName: "山田",
      guestFirstName: "太郎",
      guestEmail: `guest-${crypto.randomUUID()}@example.com`,
      // 占有チェック対象からは外れるべき soft-delete 済み行
      // （実運用では customer purge / anonymize 等の経路で発生しうる）。
      deletedAt: new Date(),
    },
    select: { id: true },
  });
  return reservation.id;
}

describeMaybe("Space 占有判定 predicate の deletedAt 整合性", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ deleteSpaceCommand } = await import("@/shared/domain/spaces/commands"));
    ({ bulkDeleteSpacesCommand } =
      await import("@/shared/domain/spaces/bulk-commands"));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("deleteSpaceCommand は soft-delete 済み CONFIRMED 予約を占有と見なさない", async () => {
    const { spaceId, customerId, cleanup } = await createSpaceFixture();
    try {
      await createSoftDeletedConfirmedReservation({ spaceId, customerId });

      const result = await deleteSpaceCommand(spaceId);
      expect(result.id).toBe(spaceId);

      const row = await prisma.space.findUniqueOrThrow({
        where: { id: spaceId },
        select: { isActive: true },
      });
      expect(row.isActive).toBe(false);
    } finally {
      await cleanup();
    }
  });

  test("bulkDeleteSpacesCommand は soft-delete 済み CONFIRMED 予約を占有と見なさない", async () => {
    const { spaceId, customerId, cleanup } = await createSpaceFixture();
    try {
      await createSoftDeletedConfirmedReservation({ spaceId, customerId });

      const result = await bulkDeleteSpacesCommand([spaceId]);
      expect(result.skippedIds).toEqual([]);
      expect(result.affected.map((s) => s.id)).toEqual([spaceId]);
      expect(result.count).toBe(1);

      const row = await prisma.space.findUniqueOrThrow({
        where: { id: spaceId },
        select: { isActive: true },
      });
      expect(row.isActive).toBe(false);
    } finally {
      await cleanup();
    }
  });
});
