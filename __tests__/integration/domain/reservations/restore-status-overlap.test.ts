/**
 * restoreReservationStatusCommand の占有チェック実 DB 回帰テスト。
 *
 * 修正前は `targetStatus === CONFIRMED` のときだけ `lockSpaceForTransaction` +
 * `checkSpaceOverlap` を行っていたが、EXCLUDE 制約
 * (`reservations_no_active_time_overlap_excl`) の占有対象は
 * `status IN (PENDING, CONFIRMED)` の両方であるため、PENDING への復元は
 * 検査を素通りしていた。同一時間帯に別の CONFIRMED 予約が既に存在する状態で
 * PENDING 復元を呼ぶと、domain 層の人間可読な VALIDATION ではなく DB 側の
 * 生の例外（EXCLUDE 制約違反）で失敗していた。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { CancelledBy } from "@/shared/lib/validations/enums/prisma-types";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type LifecycleCommandsModule =
  typeof import("@/shared/domain/reservations/lifecycle-commands");

let prisma: PrismaModule["prisma"];
let restoreReservationStatusCommand: LifecycleCommandsModule["restoreReservationStatusCommand"];

type SpaceFixture = {
  spaceId: string;
  customerId: string;
  cleanup: () => Promise<void>;
};

let nextSortOrder = 1_600_000_000;

async function createSpaceFixture(): Promise<SpaceFixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `restore-overlap-loc-${suffix}`,
      name: `Restore Overlap Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextSortOrder++,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `restore-overlap-space-${suffix}`,
      name: `Restore Overlap Space ${suffix}`,
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
      email: `restore-overlap-${suffix}@example.com`,
      emailCanonical: `restore-overlap-${suffix}@example.com`,
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

async function createReservation(params: {
  spaceId: string;
  customerId: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  startTime: Date;
  endTime: Date;
}): Promise<string> {
  const reservation = await prisma.reservation.create({
    data: {
      spaceId: params.spaceId,
      customerId: params.customerId,
      status: params.status,
      paymentStatus: "UNPAID",
      startTime: params.startTime,
      endTime: params.endTime,
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
      ...(params.status === "CANCELLED"
        ? {
            cancelledAt: new Date(),
            cancelledByType: CancelledBy.CUSTOMER_MYPAGE,
          }
        : {}),
    },
    select: { id: true },
  });
  return reservation.id;
}

describeMaybe("restoreReservationStatusCommand の占有チェック", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ restoreReservationStatusCommand } =
      await import("@/shared/domain/reservations/lifecycle-commands"));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("PENDING 復元は重複がある場合 domain VALIDATION で拒否する（DB 生エラーにしない）", async () => {
    const { spaceId, customerId, cleanup } = await createSpaceFixture();
    const startTime = new Date("2027-04-10T10:00:00.000Z");
    const endTime = new Date("2027-04-10T12:00:00.000Z");

    try {
      const cancelledId = await createReservation({
        spaceId,
        customerId,
        status: "CANCELLED",
        startTime,
        endTime,
      });
      await createReservation({
        spaceId,
        customerId,
        status: "CONFIRMED",
        startTime,
        endTime,
      });

      let thrown: unknown = null;
      try {
        await restoreReservationStatusCommand(cancelledId, "PENDING");
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toMatchObject({ name: "DomainError", code: "VALIDATION" });

      const row = await prisma.reservation.findUniqueOrThrow({
        where: { id: cancelledId },
        select: { status: true },
      });
      expect(row.status).toBe("CANCELLED");
    } finally {
      await cleanup();
    }
  });

  test("CONFIRMED 復元は重複がある場合 domain VALIDATION で拒否する（回帰ガード）", async () => {
    const { spaceId, customerId, cleanup } = await createSpaceFixture();
    const startTime = new Date("2027-04-11T10:00:00.000Z");
    const endTime = new Date("2027-04-11T12:00:00.000Z");

    try {
      const cancelledId = await createReservation({
        spaceId,
        customerId,
        status: "CANCELLED",
        startTime,
        endTime,
      });
      await createReservation({
        spaceId,
        customerId,
        status: "CONFIRMED",
        startTime,
        endTime,
      });

      let thrown: unknown = null;
      try {
        await restoreReservationStatusCommand(cancelledId, "CONFIRMED");
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toMatchObject({ name: "DomainError", code: "VALIDATION" });
    } finally {
      await cleanup();
    }
  });

  test("隣接する時間帯（重複なし）への PENDING 復元は成功する", async () => {
    const { spaceId, customerId, cleanup } = await createSpaceFixture();
    const cancelledStart = new Date("2027-04-12T10:00:00.000Z");
    const cancelledEnd = new Date("2027-04-12T12:00:00.000Z");
    const adjacentStart = cancelledEnd;
    const adjacentEnd = new Date("2027-04-12T13:00:00.000Z");

    try {
      const cancelledId = await createReservation({
        spaceId,
        customerId,
        status: "CANCELLED",
        startTime: cancelledStart,
        endTime: cancelledEnd,
      });
      await createReservation({
        spaceId,
        customerId,
        status: "CONFIRMED",
        startTime: adjacentStart,
        endTime: adjacentEnd,
      });

      await restoreReservationStatusCommand(cancelledId, "PENDING");

      const row = await prisma.reservation.findUniqueOrThrow({
        where: { id: cancelledId },
        select: { status: true },
      });
      expect(row.status).toBe("PENDING");
    } finally {
      await cleanup();
    }
  });
});
