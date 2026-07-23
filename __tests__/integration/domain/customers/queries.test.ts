/**
 * getCustomerById の統合テスト（実 DB 必須）。
 *
 * イベント参加履歴 (eventRegistrations) の include が正しく機能し、
 * customerId に紐づく EventRegistration が event 情報付きで返ることを検証する。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  EventScheduleMode,
  EventStatus,
  RegistrationStatus,
} from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type CustomerQueriesModule = typeof import("@/shared/domain/customers/queries");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let getCustomerById: CustomerQueriesModule["getCustomerById"];
let testCategoryId: string;

async function createFixtureCustomer(): Promise<string> {
  const suffix = crypto.randomUUID();
  const customer = await basePrisma.customer.create({
    data: {
      lastName: "参加履歴",
      firstName: "太郎",
      email: `customer-queries-${suffix}@example.com`,
      emailCanonical: `customer-queries-${suffix}@example.com`,
    },
    select: { id: true },
  });
  return customer.id;
}

async function createFixtureEvent(): Promise<{
  eventId: string;
  slotId: string;
  ticketId: string;
  title: string;
}> {
  const suffix = crypto.randomUUID();
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 26 * 60 * 60 * 1000);
  const title = `顧客詳細参加履歴テスト ${suffix}`;

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title,
        slug: `customer-queries-event-${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>t</p>",
        descriptionPlainText: "t",
        status: EventStatus.PUBLISHED,
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        registrationOpen: true,
        firstSlotStartAt: start,
        lastSlotEndAt: end,
        categoryId: testCategoryId,
      },
      select: { id: true },
    });
    const slot = await tx.eventTimeSlot.create({
      data: { eventId: event.id, startAt: start, endAt: end, capacity: 10 },
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
    return { eventId: event.id, slotId: slot.id, ticketId: ticket.id, title };
  });
}

async function cleanupEventFixture(eventId: string): Promise<void> {
  // eventTimeSlot は明示的に削除しない。SINGLE_OCCURRENCE events は
  // 「ちょうど1つのslot」というDEFERRED制約を持つため、event本体より先に
  // slotだけを消すとslot_count=0でトリガーが発火する。event削除のCascadeに
  // slot削除を任せる(risk-detection.test.tsと同じ順序)。
  await basePrisma.eventRegistration.deleteMany({ where: { eventId } });
  await basePrisma.eventTicket.deleteMany({ where: { eventId } });
  await basePrisma.event.deleteMany({ where: { id: eventId } });
}

async function cleanupCustomerFixture(customerId: string): Promise<void> {
  await basePrisma.customer.deleteMany({ where: { id: customerId } });
}

describeMaybe("getCustomerById", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ getCustomerById } = await import("@/shared/domain/customers/queries"));

    const category = await prisma.eventCategory.create({
      data: {
        name: `Customer Queries Test Category ${crypto.randomUUID()}`,
        // sortOrder はテーブル全体でユニーク制約があるため、並行実行する他の
        // integration test ファイルの EventCategory 行と衝突しない乱数域を使う。
        sortOrder: 10_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    testCategoryId = category.id;
  });

  afterAll(async () => {
    // EventCategory は onDelete: Restrict のため、紐づく Event の削除後に削除する。
    await prisma.eventCategory.deleteMany({ where: { id: testCategoryId } });
    await basePrisma.$disconnect();
  });

  test("getCustomerById は customerId に紐づくイベント参加履歴を含む(最新20件)", async () => {
    const customerId = await createFixtureCustomer();
    const { eventId, slotId, ticketId, title } = await createFixtureEvent();

    try {
      await basePrisma.eventRegistration.create({
        data: {
          eventId,
          slotId,
          ticketId,
          name: "参加履歴 太郎",
          email: "customer-queries-registration@example.com",
          quantity: 2,
          status: RegistrationStatus.CONFIRMED,
          customerId,
        },
      });

      const result = await getCustomerById(customerId);

      expect(result).not.toBeNull();
      expect(result?.eventRegistrations).toHaveLength(1);
      const registration = result?.eventRegistrations[0];
      expect(registration?.event.title).toBe(title);
      expect(registration?.status).toBe(RegistrationStatus.CONFIRMED);
      expect(registration?.quantity).toBe(2);
      expect(typeof registration?.createdAt).toBe("string");
      expect(registration?.event.id).toBe(eventId);
    } finally {
      await cleanupEventFixture(eventId);
      await cleanupCustomerFixture(customerId);
    }
  }, 15_000);

  test("イベント参加履歴が無い顧客は空配列を返す", async () => {
    const customerId = await createFixtureCustomer();

    try {
      const result = await getCustomerById(customerId);

      expect(result).not.toBeNull();
      expect(result?.eventRegistrations).toEqual([]);
    } finally {
      await cleanupCustomerFixture(customerId);
    }
  }, 15_000);
});
