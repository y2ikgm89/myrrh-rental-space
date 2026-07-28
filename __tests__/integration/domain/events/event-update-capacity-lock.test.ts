/**
 * updateEventCommand の定員 sync と公開申込の直列化（advisory lock 728350）統合テスト。
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { installEmailLibDispatchMock } from "../../../support/email-lib-dispatch-mock";
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

mock.module("@/shared/domain/features/check", () => ({
  isFeatureEnabled: () => Promise.resolve(true),
}));

installEmailLibDispatchMock();

mock.module("@/shared/domain/settings/queries/email-render-context", () => ({
  getEventEmailRenderContext: () =>
    Promise.resolve({
      calendarSettings: {
        icalAttachmentEnabled: false,
        addToCalendarLinksEnabled: false,
      },
      deadlineSettings: { cancellationDeadlineHours: 24 },
      organizer: { name: "Test Org", email: "org@example.com" },
    }),
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type CommandsModule = typeof import("@/shared/domain/events/commands");
type RegistrationCommandsModule =
  typeof import("@/shared/domain/events/registration-commands");

let prisma: PrismaModule["prisma"];
let updateEventCommand: CommandsModule["updateEventCommand"];
let createEventRegistrationCommand: RegistrationCommandsModule["createEventRegistrationCommand"];
let testCategoryId: string;

async function createPublishedEventWithRegistrations(opts: {
  slotCapacity: number;
  confirmedCount: number;
}): Promise<{
  eventId: string;
  ticketId: string;
  start: Date;
  end: Date;
}> {
  const suffix = crypto.randomUUID();
  const start = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 50 * 60 * 60 * 1000);

  const { eventId, ticketId } = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: "Capacity Lock Test",
        slug: `capacity-lock-${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
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
      data: {
        eventId: event.id,
        startAt: start,
        endAt: end,
        capacity: opts.slotCapacity,
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

    for (let i = 0; i < opts.confirmedCount; i++) {
      await tx.eventRegistration.create({
        data: {
          eventId: event.id,
          slotId: slot.id,
          ticketId: ticket.id,
          name: `確定者${String(i)}`,
          email: `confirmed-${suffix}-${String(i)}@example.com`,
          quantity: 1,
          status: RegistrationStatus.CONFIRMED,
        },
      });
    }

    return { eventId: event.id, ticketId: ticket.id };
  });

  return { eventId, ticketId, start, end };
}

describeMaybe("updateEventCommand — capacity lock 728350", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ updateEventCommand } = await import("@/shared/domain/events/commands"));
    ({ createEventRegistrationCommand } =
      await import("@/shared/domain/events/registration-commands"));

    const category = await prisma.eventCategory.create({
      data: {
        name: `Capacity Lock Category ${crypto.randomUUID()}`,
        sortOrder: 20_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    testCategoryId = category.id;
  }, 60_000);

  afterAll(async () => {
    await prisma.event.deleteMany({});
    await prisma.eventCategory.deleteMany({ where: { id: testCategoryId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.event.deleteMany({});
  });

  test("定員引き下げと申込 create が並行しても CONFIRMED 合計 <= slot.capacity", async () => {
    const { eventId, ticketId, start, end } =
      await createPublishedEventWithRegistrations({
        slotCapacity: 10,
        confirmedCount: 8,
      });

    const eventMeta = await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { slug: true, title: true },
    });
    const ticket = await prisma.eventTicket.findUniqueOrThrow({
      where: { id: ticketId },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        capacity: true,
        unitSize: true,
        isAvailable: true,
      },
    });
    const slot = await prisma.eventTimeSlot.findFirstOrThrow({
      where: { eventId },
      select: { id: true },
    });

    const results = await Promise.allSettled([
      updateEventCommand(eventId, {
        title: eventMeta.title,
        slug: eventMeta.slug,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        gallery: [],
        categoryId: testCategoryId,
        status: EventStatus.PUBLISHED,
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        registrationOpen: true,
        slots: [{ startAt: start, endAt: end, capacity: 8 }],
        tickets: [
          {
            id: ticket.id,
            name: ticket.name,
            description: ticket.description,
            price: ticket.price,
            capacity: ticket.capacity,
            unitSize: ticket.unitSize,
            isAvailable: ticket.isAvailable,
          },
        ],
      }),
      createEventRegistrationCommand({
        eventId,
        slotId: slot.id,
        ticketId,
        name: "並行申込者",
        email: `parallel-reg-${eventId}@example.com`,
        quantity: 1,
      }),
    ]);

    const slotAfter = await prisma.eventTimeSlot.findFirstOrThrow({
      where: { eventId },
      select: { capacity: true },
    });
    const confirmedAgg = await prisma.eventRegistration.aggregate({
      where: {
        eventId,
        status: RegistrationStatus.CONFIRMED,
      },
      _sum: { quantity: true },
    });
    const confirmedTotal = confirmedAgg._sum.quantity ?? 0;

    expect(confirmedTotal).toBeLessThanOrEqual(slotAfter.capacity);
    expect(results.some((r) => r.status === "rejected")).toBe(true);
  }, 30_000);
});
