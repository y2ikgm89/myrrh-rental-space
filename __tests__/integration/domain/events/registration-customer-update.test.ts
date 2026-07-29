/**
 * updateCustomerEventRegistration / updateGuestEventRegistrationByToken の実DB統合テスト。
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { EventScheduleMode, EventStatus } from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type CommandsModule =
  typeof import("@/shared/domain/events/registration-commands");

let prisma: PrismaModule["prisma"];
let updateCustomerEventRegistration: CommandsModule["updateCustomerEventRegistration"];
let updateGuestEventRegistrationByToken: CommandsModule["updateGuestEventRegistrationByToken"];
let testCategoryId: string;
let testCustomerId: string;

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
        title: `Self-serve edit test ${suffix}`,
        slug: `self-serve-edit-${suffix}`,
        status: EventStatus.PUBLISHED,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        registrationOpen: true,
        firstSlotStartAt: start,
        lastSlotEndAt: end,
        categoryId: testCategoryId,
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
        price: 1000,
        isAvailable: true,
      },
      select: { id: true },
    });

    return { eventId: event.id, slotId: slot.id, ticketId: ticket.id };
  });
}

async function createRegistration(
  fixture: { eventId: string; slotId: string; ticketId: string },
  overrides: {
    quantity?: number;
    status?: string;
    paymentStatus?: string;
    customerId?: string | null;
  } = {},
): Promise<string> {
  const reg = await prisma.eventRegistration.create({
    data: {
      eventId: fixture.eventId,
      slotId: fixture.slotId,
      ticketId: fixture.ticketId,
      name: "山田太郎",
      email: "guest-edit@example.com",
      phone: "090-1111-2222",
      note: "初期メモ",
      quantity: overrides.quantity ?? 1,
      status: (overrides.status ?? "CONFIRMED") as never,
      paymentStatus: (overrides.paymentStatus ?? "UNPAID") as never,
      customerId: overrides.customerId ?? null,
    },
  });
  return reg.id;
}

async function cleanupFixture(eventId: string): Promise<void> {
  await prisma.eventRegistration.deleteMany({ where: { eventId } });
  await prisma.eventTicket.deleteMany({ where: { eventId } });
  await prisma.event.delete({ where: { id: eventId } });
}

describeMaybe("event registration self-serve update commands", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ updateCustomerEventRegistration, updateGuestEventRegistrationByToken } =
      await import("@/shared/domain/events/registration-commands"));

    const category = await prisma.eventCategory.create({
      data: {
        name: `Self-serve edit category ${crypto.randomUUID()}`,
        sortOrder: 20_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    testCategoryId = category.id;

    const customer = await prisma.customer.create({
      data: {
        email: `self-serve-edit-${crypto.randomUUID()}@example.com`,
        emailCanonical: `self-serve-edit-${crypto.randomUUID()}@example.com`,
        lastName: "会員",
        firstName: "テスト",
      },
      select: { id: true },
    });
    testCustomerId = customer.id;
  });

  afterAll(async () => {
    if (!TEST_DB_URL) return;
    await prisma.eventRegistration.deleteMany({
      where: { event: { categoryId: testCategoryId } },
    });
    await prisma.event.deleteMany({ where: { categoryId: testCategoryId } });
    await prisma.customer.deleteMany({ where: { id: testCustomerId } });
    await prisma.eventCategory.deleteMany({ where: { id: testCategoryId } });
  });

  test("token 経路で連絡先を更新できる", async () => {
    const fixture = await createFixtureEvent(10);
    const registrationId = await createRegistration(fixture);

    const result = await updateGuestEventRegistrationByToken(registrationId, {
      name: "山田花子",
      email: "updated@example.com",
      phone: "090-3333-4444",
      note: "更新メモ",
      quantity: 1,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const row = await prisma.eventRegistration.findUnique({
      where: { id: registrationId },
    });
    expect(row?.name).toBe("山田花子");
    expect(row?.email).toBe("updated@example.com");

    await cleanupFixture(fixture.eventId);
  });

  test("customer 経路は ownership 不一致で NOT_FOUND 相当", async () => {
    const fixture = await createFixtureEvent(10);
    const registrationId = await createRegistration(fixture);

    const result = await updateCustomerEventRegistration(
      registrationId,
      testCustomerId,
      {
        name: "侵入",
        email: "hack@example.com",
        phone: null,
        note: null,
        quantity: 1,
      },
    );

    expect(result).toEqual({ success: false, error: "申込が見つかりません" });
    await cleanupFixture(fixture.eventId);
  });

  test("PENDING 化済みは payment ゲートで拒否", async () => {
    const fixture = await createFixtureEvent(10);
    const registrationId = await createRegistration(fixture, {
      paymentStatus: "PENDING",
    });

    const result = await updateGuestEventRegistrationByToken(registrationId, {
      name: "更新",
      email: "updated@example.com",
      phone: null,
      note: null,
      quantity: 1,
    });

    expect(result).toEqual({
      success: false,
      error: "お支払い済みまたは決済処理中のため、申込内容を変更できません",
    });

    await cleanupFixture(fixture.eventId);
  });

  test("WAITLISTED_OFFERED 中の quantity 変更は拒否", async () => {
    const fixture = await createFixtureEvent(10);
    const registrationId = await createRegistration(fixture, {
      status: "WAITLISTED_OFFERED",
    });

    const result = await updateGuestEventRegistrationByToken(registrationId, {
      name: "山田太郎",
      email: "guest-edit@example.com",
      phone: null,
      note: null,
      quantity: 2,
    });

    expect(result).toEqual({
      success: false,
      error:
        "繰り上げ当選中は参加人数を変更できません。一度キャンセルして再度お申込みください",
    });

    await cleanupFixture(fixture.eventId);
  });
});
