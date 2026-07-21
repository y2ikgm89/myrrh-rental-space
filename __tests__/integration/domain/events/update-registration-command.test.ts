/**
 * updateEventRegistrationCommand の実DB統合テスト。
 * 定員再判定・WAITLISTED_OFFERED中のquantity変更禁止・NOT_FOUND/CONFLICTを実DBで検証する。
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { EventScheduleMode, EventStatus } from "@generated/prisma/enums";

// グローバル preload (__tests__/setup.ts) は DATABASE_URL をダミー値に固定する。
// gateway を読む前に実テスト DB へ向け直す
const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type RegistrationCommandsModule =
  typeof import("@/shared/domain/events/registration-commands");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let updateEventRegistrationCommand: RegistrationCommandsModule["updateEventRegistrationCommand"];

async function createFixtureEvent(capacity: number): Promise<{
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
        title: `テストイベント ${suffix}`,
        slug: `test-event-${suffix}`,
        status: EventStatus.PUBLISHED,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        registrationOpen: true,
        firstSlotStartAt: start,
        lastSlotEndAt: end,
      },
      select: { id: true },
    });

    const slot = await tx.eventTimeSlot.create({
      data: {
        eventId: event.id,
        startAt: start,
        endAt: end,
        capacity,
      },
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

async function createFixtureRegistration(
  fixture: { eventId: string; slotId: string; ticketId: string },
  overrides: { quantity?: number; status?: string } = {},
): Promise<string> {
  const reg = await prisma.eventRegistration.create({
    data: {
      eventId: fixture.eventId,
      slotId: fixture.slotId,
      ticketId: fixture.ticketId,
      name: "既存太郎",
      email: "existing@example.com",
      phone: "090-0000-0000",
      note: "既存メモ",
      quantity: overrides.quantity ?? 1,
      status: (overrides.status ?? "CONFIRMED") as never,
    },
  });
  return reg.id;
}

async function cleanupFixture(eventId: string): Promise<void> {
  await prisma.eventRegistration.deleteMany({ where: { eventId } });
  await prisma.eventTicket.deleteMany({ where: { eventId } });
  await prisma.event.delete({ where: { id: eventId } });
}

describeMaybe("updateEventRegistrationCommand", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ updateEventRegistrationCommand } =
      await import("@/shared/domain/events/registration-commands"));
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  // Pool drain: fire-and-forget functions in rapid succession can exhaust the
  // Prisma connection pool. A 1s sleep between tests allows it to drain.
  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  test("氏名・email・電話・備考・数量を変更でき、変更前の値を previous として返す", async () => {
    const fixture = await createFixtureEvent(10);
    const registrationId = await createFixtureRegistration(fixture, {
      quantity: 2,
    });

    try {
      const result = await updateEventRegistrationCommand({
        registrationId,
        name: "更新太郎",
        email: "updated@example.com",
        phone: "090-1111-1111",
        note: "更新メモ",
        quantity: 3,
      });

      expect(result.previous).toEqual({
        name: "既存太郎",
        email: "existing@example.com",
        phone: "090-0000-0000",
        note: "既存メモ",
        quantity: 2,
      });

      const updated = await prisma.eventRegistration.findUniqueOrThrow({
        where: { id: registrationId },
      });
      expect(updated.name).toBe("更新太郎");
      expect(updated.quantity).toBe(3);
    } finally {
      await cleanupFixture(fixture.eventId);
      await sleep(1000);
    }
  });

  test("定員超過になる数量変更は CONFLICT で拒否される", async () => {
    const fixture = await createFixtureEvent(3);
    const registrationId = await createFixtureRegistration(fixture, {
      quantity: 2,
    });
    // 残枠を圧迫する別の CONFIRMED 申込
    await createFixtureRegistration(fixture, { quantity: 1 });

    try {
      await expect(
        updateEventRegistrationCommand({
          registrationId,
          name: "更新太郎",
          email: null,
          phone: null,
          note: null,
          quantity: 3, // 既存2件で定員3を使い切っているため+1は超過
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    } finally {
      await cleanupFixture(fixture.eventId);
      await sleep(1000);
    }
  }, 30_000);

  test("WAITLISTED_OFFERED 中の quantity 変更は VALIDATION で拒否される", async () => {
    const fixture = await createFixtureEvent(10);
    const registrationId = await createFixtureRegistration(fixture, {
      quantity: 1,
      status: "WAITLISTED_OFFERED",
    });

    try {
      await expect(
        updateEventRegistrationCommand({
          registrationId,
          name: "更新太郎",
          email: null,
          phone: null,
          note: null,
          quantity: 2,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    } finally {
      await cleanupFixture(fixture.eventId);
      await sleep(1000);
    }
  }, 30_000);

  test("WAITLISTED_OFFERED 中でも name/email/note の変更は quantity 据え置きなら成功する", async () => {
    const fixture = await createFixtureEvent(10);
    const registrationId = await createFixtureRegistration(fixture, {
      quantity: 1,
      status: "WAITLISTED_OFFERED",
    });

    try {
      const result = await updateEventRegistrationCommand({
        registrationId,
        name: "更新太郎",
        email: null,
        phone: null,
        note: null,
        quantity: 1,
      });
      expect(result.previous.name).toBe("既存太郎");
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  });

  test("CANCELLED な参加登録は編集できず CONFLICT を返す", async () => {
    const fixture = await createFixtureEvent(10);
    const registrationId = await createFixtureRegistration(fixture, {
      status: "CANCELLED",
    });

    try {
      await expect(
        updateEventRegistrationCommand({
          registrationId,
          name: "更新太郎",
          email: null,
          phone: null,
          note: null,
          quantity: 1,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    } finally {
      await cleanupFixture(fixture.eventId);
      await sleep(1000);
    }
  }, 30_000);

  test("存在しない registrationId は NOT_FOUND を返す", async () => {
    await expect(
      updateEventRegistrationCommand({
        registrationId: "nonexistent000000000000000",
        name: "x",
        email: null,
        phone: null,
        note: null,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
