/**
 * getEventRegistrations の search/status フィルタを実DBで検証する。
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  EventScheduleMode,
  EventStatus,
  RegistrationStatus,
} from "@generated/prisma/enums";

// グローバル preload (__tests__/setup.ts) は DATABASE_URL をダミー値に固定する。
// gateway を読む前に実テスト DB へ向け直す。
const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type RegistrationQueriesModule =
  typeof import("@/shared/domain/events/registration-queries");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let getEventRegistrations: RegistrationQueriesModule["getEventRegistrations"];

async function createFixtureEvent(): Promise<{
  eventId: string;
  slotId: string;
  ticketId: string;
}> {
  const suffix = crypto.randomUUID();
  const slotStart = new Date("2026-08-01T10:00:00.000Z");
  const slotEnd = new Date("2026-08-01T12:00:00.000Z");

  const result = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: `検索テスト ${suffix}`,
        slug: `search-test-${suffix}`,
        status: EventStatus.PUBLISHED,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        registrationOpen: true,
        firstSlotStartAt: slotStart,
        lastSlotEndAt: slotEnd,
      },
    });

    const slot = await tx.eventTimeSlot.create({
      data: {
        eventId: event.id,
        startAt: slotStart,
        endAt: slotEnd,
        capacity: 10,
      },
    });

    const ticket = await tx.eventTicket.create({
      data: { eventId: event.id, name: "一般", price: 0, isAvailable: true },
    });

    return { eventId: event.id, slotId: slot.id, ticketId: ticket.id };
  });

  return result;
}

async function cleanupFixture(eventId: string): Promise<void> {
  // event_time_slots を明示 delete すると、SINGLE_OCCURRENCE の event 行がまだ
  // 存在する状態で slot_count=0 になり、deferred CHECK 制約
  // (check_event_schedule_integrity) が commit 時に違反する。event.delete() の
  // onDelete: Cascade に slot 削除を委譲すれば、同一トランザクション内で親行も
  // 消えるため制約チェックは対象イベントなしとして早期 return される。
  await basePrisma.eventRegistration.deleteMany({ where: { eventId } });
  await basePrisma.eventTicket.deleteMany({ where: { eventId } });
  await basePrisma.event.delete({ where: { id: eventId } });
}

describeMaybe("getEventRegistrations 検索・フィルタ", () => {
  beforeAll(async () => {
    // プロセス環境から TEST_DATABASE_URL を読み込む前に gateway をロード
    // する必要があるため、beforeAll の中で動的 import を行う
    if (TEST_DB_URL) {
      process.env["DATABASE_URL"] = TEST_DB_URL;
    }
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ getEventRegistrations } =
      await import("@/shared/domain/events/registration-queries"));
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("氏名の部分一致（大文字小文字区別なし）で絞り込める", async () => {
    const fixture = await createFixtureEvent();
    await basePrisma.eventRegistration.create({
      data: {
        eventId: fixture.eventId,
        slotId: fixture.slotId,
        ticketId: fixture.ticketId,
        name: "Yamada Taro",
        email: "taro@example.com",
        quantity: 1,
      },
    });
    await basePrisma.eventRegistration.create({
      data: {
        eventId: fixture.eventId,
        slotId: fixture.slotId,
        ticketId: fixture.ticketId,
        name: "Suzuki Hanako",
        email: "hanako@example.com",
        quantity: 1,
      },
    });

    try {
      const result = await getEventRegistrations(fixture.eventId, {
        search: "yamada",
      });
      expect(result.total).toBe(1);
      expect(result.registrations[0]?.name).toBe("Yamada Taro");
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  });

  test("email の部分一致でも絞り込める", async () => {
    const fixture = await createFixtureEvent();
    await basePrisma.eventRegistration.create({
      data: {
        eventId: fixture.eventId,
        slotId: fixture.slotId,
        ticketId: fixture.ticketId,
        name: "Yamada Taro",
        email: "taro@example.com",
        quantity: 1,
      },
    });

    try {
      const result = await getEventRegistrations(fixture.eventId, {
        search: "taro@example",
      });
      expect(result.total).toBe(1);
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  });

  test("status で絞り込める", async () => {
    const fixture = await createFixtureEvent();
    await basePrisma.eventRegistration.create({
      data: {
        eventId: fixture.eventId,
        slotId: fixture.slotId,
        ticketId: fixture.ticketId,
        name: "Confirmed Person",
        quantity: 1,
        status: RegistrationStatus.CONFIRMED,
      },
    });
    await basePrisma.eventRegistration.create({
      data: {
        eventId: fixture.eventId,
        slotId: fixture.slotId,
        ticketId: fixture.ticketId,
        name: "Cancelled Person",
        quantity: 1,
        status: RegistrationStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    try {
      const result = await getEventRegistrations(fixture.eventId, {
        status: RegistrationStatus.CANCELLED,
      });
      expect(result.total).toBe(1);
      expect(result.registrations[0]?.name).toBe("Cancelled Person");
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  });

  test("search/status を指定しない場合は既存の全件取得と同じ結果になる", async () => {
    const fixture = await createFixtureEvent();
    await basePrisma.eventRegistration.create({
      data: {
        eventId: fixture.eventId,
        slotId: fixture.slotId,
        ticketId: fixture.ticketId,
        name: "Someone",
        quantity: 1,
      },
    });

    try {
      const result = await getEventRegistrations(fixture.eventId, {});
      expect(result.total).toBe(1);
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  });
});
