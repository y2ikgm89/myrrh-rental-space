/**
 * BLACKLIST顧客による新規予約作成の拒否を検証する統合テスト（実 DB 必須）。
 *
 * `createPublicReservationCommand` は `resolveOrCreateCustomer` で解決した
 * `customerId` を使って `ensureCustomerNotBlacklisted` を呼ぶ。この結合を
 * mock ではなく実際のトランザクション内で検証する。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 */

import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { CustomerStatus } from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

// createPublicReservationCommand は isFeatureEnabled("reservation") を直接呼ぶ。
// この real-DB テストは Settings の feature module シーディングとは無関係な
// ガード検証が目的のため、registration-overbooking.test.ts と同じ mock
// パターンで gate 自体をバイパスする。
mock.module("@/shared/domain/features/check", () => ({
  isFeatureEnabled: () => Promise.resolve(true),
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type CommandsModule =
  typeof import("@/shared/domain/reservations/public-commands");

let prisma: PrismaModule["prisma"];
let createPublicReservationCommand: CommandsModule["createPublicReservationCommand"];

async function createTestLocationAndSpace(): Promise<{
  locationId: string;
  spaceId: string;
}> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `blacklist-guard-loc-${suffix}`,
      name: `Blacklist Guard Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/location.jpg",
      isActive: false,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `blacklist-guard-space-${suffix}`,
      name: `Blacklist Guard Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
      isPublished: true,
      isActive: true,
    },
    select: { id: true },
  });

  return { locationId: location.id, spaceId: space.id };
}

async function cleanupFixture(
  locationId: string,
  spaceId: string,
  email: string,
): Promise<void> {
  await prisma.reservation.deleteMany({ where: { spaceId } });
  await prisma.space.deleteMany({ where: { id: spaceId } });
  await prisma.location.deleteMany({ where: { id: locationId } });
  await prisma.customer.deleteMany({ where: { email } });
}

describeMaybe("createPublicReservationCommand — BLACKLIST guard", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ createPublicReservationCommand } =
      await import("@/shared/domain/reservations/public-commands"));
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("既存のBLACKLISTゲストCustomerと同じメールでの新規ゲスト予約は拒否される", async () => {
    const { locationId, spaceId } = await createTestLocationAndSpace();
    const email = `blacklist-guard-${crypto.randomUUID()}@example.com`;

    await prisma.customer.create({
      data: {
        lastName: "拒否",
        firstName: "太郎",
        email,
        emailCanonical: email,
        status: CustomerStatus.BLACKLIST,
      },
    });

    try {
      await expect(
        createPublicReservationCommand({
          spaceId,
          date: "2027-01-15",
          startTime: "10:00",
          endTime: "12:00",
          lastName: "拒否",
          firstName: "太郎",
          email,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      const count = await prisma.reservation.count({ where: { spaceId } });
      expect(count).toBe(0);
    } finally {
      await cleanupFixture(locationId, spaceId, email);
    }
  }, 30_000);

  test("通常のゲスト予約は成立する（regression）", async () => {
    const { locationId, spaceId } = await createTestLocationAndSpace();
    const email = `blacklist-guard-ok-${crypto.randomUUID()}@example.com`;

    try {
      const result = await createPublicReservationCommand({
        spaceId,
        date: "2027-01-15",
        startTime: "10:00",
        endTime: "12:00",
        lastName: "通常",
        firstName: "花子",
        email,
      });

      expect(result.id).toBeTruthy();
      const count = await prisma.reservation.count({ where: { spaceId } });
      expect(count).toBe(1);
    } finally {
      await cleanupFixture(locationId, spaceId, email);
    }
  }, 30_000);
});
