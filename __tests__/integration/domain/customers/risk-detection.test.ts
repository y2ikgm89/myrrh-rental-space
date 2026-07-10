/**
 * 不審予約パターン検知の統合テスト（実 DB 必須）。
 *
 * `detectSuspiciousCustomers` は3パターン(rapid_booking/frequent_cancellation/
 * repeated_no_show)を実DBの groupBy+having で集計する。mockでは再現できない
 * ため実DBテストで検証する。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  EventScheduleMode,
  EventStatus,
  ReservationStatus,
  RegistrationStatus,
} from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type RiskDetectionModule =
  typeof import("@/shared/domain/customers/risk-detection");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let detectSuspiciousCustomers: RiskDetectionModule["detectSuspiciousCustomers"];
let applyRiskFlagsCommand: RiskDetectionModule["applyRiskFlagsCommand"];
let clearRiskFlagCommand: RiskDetectionModule["clearRiskFlagCommand"];

async function createFixtureSpace(): Promise<{
  locationId: string;
  spaceId: string;
}> {
  const suffix = crypto.randomUUID();
  const location = await basePrisma.location.create({
    data: {
      slug: `risk-detect-loc-${suffix}`,
      name: `Risk Detect Loc ${suffix}`,
      address: "test",
      imageUrl: "https://example.com/x.jpg",
      isActive: false,
    },
    select: { id: true },
  });
  const space = await basePrisma.space.create({
    data: {
      slug: `risk-detect-space-${suffix}`,
      name: `Risk Detect Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>t</p>",
      descriptionPlainText: "t",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.com/x.jpg",
      locationId: location.id,
      isPublished: true,
      isActive: true,
    },
    select: { id: true },
  });
  return { locationId: location.id, spaceId: space.id };
}

async function createFixtureCustomer(): Promise<string> {
  const suffix = crypto.randomUUID();
  const customer = await basePrisma.customer.create({
    data: {
      lastName: "検知",
      firstName: "太郎",
      email: `risk-detect-${suffix}@example.com`,
      emailCanonical: `risk-detect-${suffix}@example.com`,
    },
    select: { id: true },
  });
  return customer.id;
}

async function cleanupFixture(
  locationId: string,
  spaceId: string,
  customerId: string,
): Promise<void> {
  await basePrisma.reservation.deleteMany({ where: { spaceId } });
  await basePrisma.space.deleteMany({ where: { id: spaceId } });
  await basePrisma.location.deleteMany({ where: { id: locationId } });
  await basePrisma.customer.deleteMany({ where: { id: customerId } });
}

async function createFixtureEvent(): Promise<{
  eventId: string;
  slotId: string;
  ticketId: string;
}> {
  const suffix = crypto.randomUUID();
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 26 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: "Risk Detect Event",
        slug: `risk-detect-event-${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>t</p>",
        descriptionPlainText: "t",
        status: EventStatus.PUBLISHED,
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        registrationOpen: true,
        firstSlotStartAt: start,
        lastSlotEndAt: end,
      },
      select: { id: true },
    });
    const slot = await tx.eventTimeSlot.create({
      data: { eventId: event.id, startAt: start, endAt: end, capacity: 1000 },
      select: { id: true },
    });
    const ticket = await tx.eventTicket.create({
      data: {
        eventId: event.id,
        name: "一般",
        price: 0,
        isAvailable: true,
      },
      select: { id: true },
    });
    return { eventId: event.id, slotId: slot.id, ticketId: ticket.id };
  });
}

async function cleanupEventFixture(eventId: string): Promise<void> {
  // eventTimeSlot は明示的に削除しない。SINGLE_OCCURRENCE events は
  // 「ちょうど1つのslot」というDEFERRED制約を持つため、event本体より先に
  // slotだけを消すとslot_count=0でトリガーが発火する。event削除のCascadeに
  // slot削除を任せる(registration-overbooking.test.tsのcleanupEventと同じ順序)。
  await basePrisma.eventRegistration.deleteMany({ where: { eventId } });
  await basePrisma.eventTicket.deleteMany({ where: { eventId } });
  await basePrisma.event.deleteMany({ where: { id: eventId } });
}

describeMaybe("detectSuspiciousCustomers", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({
      detectSuspiciousCustomers,
      applyRiskFlagsCommand,
      clearRiskFlagCommand,
    } = await import("@/shared/domain/customers/risk-detection"));
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("直近24時間に3件以上予約作成した顧客を rapid_booking で検知する", async () => {
    const { locationId, spaceId } = await createFixtureSpace();
    const customerId = await createFixtureCustomer();
    const now = new Date();

    try {
      for (let i = 0; i < 3; i++) {
        await basePrisma.reservation.create({
          data: {
            spaceId,
            customerId,
            startTime: new Date(now.getTime() + (i + 1) * 3 * 60 * 60 * 1000),
            endTime: new Date(
              now.getTime() + (i + 1) * 3 * 60 * 60 * 1000 + 60 * 60 * 1000,
            ),
            status: ReservationStatus.CONFIRMED,
          },
        });
      }

      const detected = await detectSuspiciousCustomers(now);
      const match = detected.find((d) => d.customerId === customerId);

      expect(match).toBeDefined();
      expect(match?.reasons).toContain("rapid_booking");
    } finally {
      await cleanupFixture(locationId, spaceId, customerId);
    }
  }, 15_000);

  test("2件のみの作成では rapid_booking として検知されない(閾値未満)", async () => {
    const { locationId, spaceId } = await createFixtureSpace();
    const customerId = await createFixtureCustomer();
    const now = new Date();

    try {
      for (let i = 0; i < 2; i++) {
        await basePrisma.reservation.create({
          data: {
            spaceId,
            customerId,
            startTime: new Date(now.getTime() + (i + 1) * 3 * 60 * 60 * 1000),
            endTime: new Date(
              now.getTime() + (i + 1) * 3 * 60 * 60 * 1000 + 60 * 60 * 1000,
            ),
            status: ReservationStatus.CONFIRMED,
          },
        });
      }

      const detected = await detectSuspiciousCustomers(now);
      const match = detected.find((d) => d.customerId === customerId);

      expect(match).toBeUndefined();
    } finally {
      await cleanupFixture(locationId, spaceId, customerId);
    }
  }, 15_000);

  test("6日前(週次cronの実行間隔内)の24時間バーストも検知する(P1回帰)", async () => {
    // cronは週次実行だが、rapid_bookingは「直近24時間」の概念。もし単純に
    // now-24hだけをスキャンすると、週の早い時点(6日前等)のバーストが
    // 永久に検知漏れになる。直近7日分をスキャンしスライディングウィンドウで
    // 判定することで、このケースも捉えられる必要がある。
    const { locationId, spaceId } = await createFixtureSpace();
    const customerId = await createFixtureCustomer();
    const now = new Date();
    const sixDaysAgo = now.getTime() - 6 * 24 * 60 * 60 * 1000;

    try {
      for (let i = 0; i < 3; i++) {
        await basePrisma.reservation.create({
          data: {
            spaceId,
            customerId,
            startTime: new Date(sixDaysAgo + (i + 1) * 3 * 60 * 60 * 1000),
            endTime: new Date(
              sixDaysAgo + (i + 1) * 3 * 60 * 60 * 1000 + 60 * 60 * 1000,
            ),
            status: ReservationStatus.CONFIRMED,
            createdAt: new Date(sixDaysAgo + i * 60 * 60 * 1000),
          },
        });
      }

      const detected = await detectSuspiciousCustomers(now);
      const match = detected.find((d) => d.customerId === customerId);

      expect(match).toBeDefined();
      expect(match?.reasons).toContain("rapid_booking");
    } finally {
      await cleanupFixture(locationId, spaceId, customerId);
    }
  }, 15_000);

  test("予約2件+イベント申込1件の混在バーストを合算して検知する(P2回帰)", async () => {
    const { locationId, spaceId } = await createFixtureSpace();
    const { eventId, slotId, ticketId } = await createFixtureEvent();
    const customerId = await createFixtureCustomer();
    const now = new Date();

    try {
      for (let i = 0; i < 2; i++) {
        await basePrisma.reservation.create({
          data: {
            spaceId,
            customerId,
            startTime: new Date(now.getTime() + (i + 1) * 3 * 60 * 60 * 1000),
            endTime: new Date(
              now.getTime() + (i + 1) * 3 * 60 * 60 * 1000 + 60 * 60 * 1000,
            ),
            status: ReservationStatus.CONFIRMED,
          },
        });
      }
      await basePrisma.eventRegistration.create({
        data: {
          eventId,
          slotId,
          ticketId,
          name: "検知 太郎",
          email: "risk-detect-mixed@example.com",
          quantity: 1,
          status: RegistrationStatus.CONFIRMED,
          customerId,
        },
      });

      const detected = await detectSuspiciousCustomers(now);
      const match = detected.find((d) => d.customerId === customerId);

      expect(match).toBeDefined();
      expect(match?.reasons).toContain("rapid_booking");
    } finally {
      await cleanupEventFixture(eventId);
      await cleanupFixture(locationId, spaceId, customerId);
    }
  }, 15_000);

  test("予約2回キャンセル+申込1回キャンセルの合算で frequent_cancellation を検知する(P2回帰)", async () => {
    const { locationId, spaceId } = await createFixtureSpace();
    const { eventId, slotId, ticketId } = await createFixtureEvent();
    const customerId = await createFixtureCustomer();
    const now = new Date();

    try {
      for (let i = 0; i < 2; i++) {
        await basePrisma.reservation.create({
          data: {
            spaceId,
            customerId,
            startTime: new Date(now.getTime() + (i + 1) * 3 * 60 * 60 * 1000),
            endTime: new Date(
              now.getTime() + (i + 1) * 3 * 60 * 60 * 1000 + 60 * 60 * 1000,
            ),
            status: ReservationStatus.CANCELLED,
            cancelledAt: new Date(now.getTime() - i * 24 * 60 * 60 * 1000),
          },
        });
      }
      await basePrisma.eventRegistration.create({
        data: {
          eventId,
          slotId,
          ticketId,
          name: "検知 太郎",
          email: "risk-detect-mixed-cancel@example.com",
          quantity: 1,
          status: RegistrationStatus.CANCELLED,
          cancelledAt: now,
          customerId,
        },
      });

      const detected = await detectSuspiciousCustomers(now);
      const match = detected.find((d) => d.customerId === customerId);

      expect(match).toBeDefined();
      expect(match?.reasons).toContain("frequent_cancellation");
    } finally {
      await cleanupEventFixture(eventId);
      await cleanupFixture(locationId, spaceId, customerId);
    }
  }, 15_000);

  test("直近30日に3回以上キャンセルした顧客を frequent_cancellation で検知する", async () => {
    const { locationId, spaceId } = await createFixtureSpace();
    const customerId = await createFixtureCustomer();
    const now = new Date();

    try {
      for (let i = 0; i < 3; i++) {
        await basePrisma.reservation.create({
          data: {
            spaceId,
            customerId,
            startTime: new Date(now.getTime() + (i + 1) * 3 * 60 * 60 * 1000),
            endTime: new Date(
              now.getTime() + (i + 1) * 3 * 60 * 60 * 1000 + 60 * 60 * 1000,
            ),
            status: ReservationStatus.CANCELLED,
            cancelledAt: new Date(now.getTime() - i * 24 * 60 * 60 * 1000),
          },
        });
      }

      const detected = await detectSuspiciousCustomers(now);
      const match = detected.find((d) => d.customerId === customerId);

      expect(match).toBeDefined();
      expect(match?.reasons).toContain("frequent_cancellation");
    } finally {
      await cleanupFixture(locationId, spaceId, customerId);
    }
  }, 15_000);

  test("直近90日に2回以上NO_SHOWの顧客を repeated_no_show で検知する", async () => {
    const { locationId, spaceId } = await createFixtureSpace();
    const customerId = await createFixtureCustomer();
    const now = new Date();

    try {
      for (let i = 0; i < 2; i++) {
        await basePrisma.reservation.create({
          data: {
            spaceId,
            customerId,
            startTime: new Date(
              now.getTime() - (i + 1) * 10 * 24 * 60 * 60 * 1000,
            ),
            endTime: new Date(
              now.getTime() -
                (i + 1) * 10 * 24 * 60 * 60 * 1000 +
                60 * 60 * 1000,
            ),
            status: ReservationStatus.NO_SHOW,
          },
        });
      }

      const detected = await detectSuspiciousCustomers(now);
      const match = detected.find((d) => d.customerId === customerId);

      expect(match).toBeDefined();
      expect(match?.reasons).toContain("repeated_no_show");
    } finally {
      await cleanupFixture(locationId, spaceId, customerId);
    }
  }, 15_000);

  test("applyRiskFlagsCommand で検知結果がCustomerに反映される", async () => {
    const { locationId, spaceId } = await createFixtureSpace();
    const customerId = await createFixtureCustomer();

    try {
      const updated = await applyRiskFlagsCommand([
        { customerId, reasons: ["rapid_booking"] },
      ]);
      expect(updated).toBe(1);

      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { flaggedForReviewAt: true, flagReasons: true },
      });
      expect(customer?.flaggedForReviewAt).not.toBeNull();
      expect(customer?.flagReasons).toEqual(["rapid_booking"]);
    } finally {
      await cleanupFixture(locationId, spaceId, customerId);
    }
  }, 15_000);

  test("clearRiskFlagCommand でフラグが解除される", async () => {
    const { locationId, spaceId } = await createFixtureSpace();
    const customerId = await createFixtureCustomer();

    try {
      await applyRiskFlagsCommand([
        { customerId, reasons: ["frequent_cancellation"] },
      ]);
      await clearRiskFlagCommand(customerId);

      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { flaggedForReviewAt: true, flagReasons: true },
      });
      expect(customer?.flaggedForReviewAt).toBeNull();
      expect(customer?.flagReasons).toEqual([]);
    } finally {
      await cleanupFixture(locationId, spaceId, customerId);
    }
  }, 15_000);
});
