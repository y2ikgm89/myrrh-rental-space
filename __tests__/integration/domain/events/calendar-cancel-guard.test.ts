/**
 * GCal 側の削除を Event へ反映する経路に、upsert 側と同じガードが掛かることの検証。
 *
 * == なぜ要るのか ==
 *
 * `cancelImportedEventFromCalendar` は `googleCalendarEventId` から親 Event を
 * 逆引きするだけで、status も申込も見ずに CANCELLED へ遷移させていた
 * （監査 F-46）。同じファイルの `upsertEventFromCalendar` は
 * `published_event_protected` / `has_active_registrations` で明示的に skip して
 * いるのに、cancel 側にだけ対称のガードが無かった。
 *
 * GCal は削除済みイベントの description を返さないので、ループ防止マーカー
 * （`isAppGeneratedCalendarEvent`）は効かない。つまり**アプリが作って outbound で
 * GCal へ出したイベント**をスタッフが GCal 上で消しただけで、公開中・申込 30 件の
 * イベントが CANCELLED になりえた。しかも設計どおり参加者通知は発火しないので、
 * 申込者は中止を知らされないまま公開ページからイベントが消える。
 *
 * == 何を mock し、何を通すか ==
 *
 * mock は無し。Event / EventTimeSlot / EventRegistration を実 DB に作り、
 * status の遷移と AdminNotification の有無を見る。**欠陥は「読む前に書いていた」
 * ことなので**、Prisma を差し替えると何も確かめられない。
 *
 * == 実行条件 ==
 *
 * 実 Postgres を要求する。`bun run test:integration` が test-db を用意する。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { EventStatus, RegistrationStatus } from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type ImportCommandsModule =
  typeof import("@/shared/domain/events/event-calendar-import-commands");

let prisma: PrismaModule["prisma"];
let cancelImportedEventFromCalendar: ImportCommandsModule["cancelImportedEventFromCalendar"];
let testCategoryId: string;

type EventFixture = {
  eventId: string;
  googleCalendarEventId: string;
  cleanup: () => Promise<void>;
};

let slotOffsetHours = 0;

async function createEvent(input: {
  status: EventStatus;
  withActiveRegistration: boolean;
}): Promise<EventFixture> {
  const suffix = crypto.randomUUID();
  const googleCalendarEventId = `gcal-import-${suffix}`;
  const start = new Date(
    Date.now() + (48 + slotOffsetHours++) * 60 * 60 * 1000,
  );
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const eventId = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: `Calendar Cancel Guard ${suffix}`,
        slug: `calendar-cancel-guard-${suffix}`,
        descriptionJson: {},
        descriptionHtml: "",
        descriptionPlainText: "",
        status: input.status,
        scheduleMode: "SINGLE_OCCURRENCE",
        categoryId: testCategoryId,
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
        capacity: 10,
        googleCalendarEventId,
      },
      select: { id: true },
    });

    if (input.withActiveRegistration) {
      const ticket = await tx.eventTicket.create({
        data: {
          eventId: event.id,
          name: "一般",
          price: 0,
          capacity: null,
          isAvailable: true,
        },
        select: { id: true },
      });
      await tx.eventRegistration.create({
        data: {
          eventId: event.id,
          slotId: slot.id,
          ticketId: ticket.id,
          name: "山田太郎",
          email: `calendar-cancel-guard-${suffix}@example.com`,
          quantity: 1,
          status: RegistrationStatus.CONFIRMED,
        },
      });
    }

    return event.id;
  });

  return {
    eventId,
    googleCalendarEventId,
    cleanup: async () => {
      await prisma.adminNotification.deleteMany({
        where: { resourceType: "event", resourceId: eventId },
      });
      await prisma.event.deleteMany({ where: { id: eventId } });
    },
  };
}

async function countBlockedNotifications(eventId: string): Promise<number> {
  return prisma.adminNotification.count({
    where: {
      type: "event_calendar_cancel_blocked",
      resourceType: "event",
      resourceId: eventId,
    },
  });
}

describeMaybe("GCal 削除の Event 反映ガード", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ cancelImportedEventFromCalendar } =
      await import("@/shared/domain/events/event-calendar-import-commands"));

    const category = await prisma.eventCategory.create({
      data: {
        name: `Calendar Cancel Guard Category ${crypto.randomUUID()}`,
        sortOrder: 40_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    testCategoryId = category.id;
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { categoryId: testCategoryId } });
    await prisma.eventCategory.deleteMany({ where: { id: testCategoryId } });
    await prisma.$disconnect();
  });

  test("PUBLISHED は CANCELLED にしない（通知だけ上げる）", async () => {
    const fixture = await createEvent({
      status: EventStatus.PUBLISHED,
      withActiveRegistration: false,
    });

    try {
      const result = await cancelImportedEventFromCalendar(
        fixture.googleCalendarEventId,
      );

      expect(result).toEqual({
        cancelled: false,
        blockedReason: "published_event_protected",
      });

      const row = await prisma.event.findUniqueOrThrow({
        where: { id: fixture.eventId },
        select: { status: true },
      });
      expect(row.status).toBe(EventStatus.PUBLISHED);

      // 黙って skip すると、GCal 上は消えているのにアプリ側は公開されたまま、
      // という食い違いが誰にも見えない。
      expect(await countBlockedNotifications(fixture.eventId)).toBe(1);
    } finally {
      await fixture.cleanup();
    }
  });

  test("DRAFT でも有効な申込があれば CANCELLED にしない", async () => {
    const fixture = await createEvent({
      status: EventStatus.DRAFT,
      withActiveRegistration: true,
    });

    try {
      const result = await cancelImportedEventFromCalendar(
        fixture.googleCalendarEventId,
      );

      expect(result).toEqual({
        cancelled: false,
        blockedReason: "has_active_registrations",
      });

      const row = await prisma.event.findUniqueOrThrow({
        where: { id: fixture.eventId },
        select: { status: true },
      });
      expect(row.status).toBe(EventStatus.DRAFT);
      expect(await countBlockedNotifications(fixture.eventId)).toBe(1);
    } finally {
      await fixture.cleanup();
    }
  });

  test("DRAFT かつ申込なしは CANCELLED にする（従来どおり）", async () => {
    const fixture = await createEvent({
      status: EventStatus.DRAFT,
      withActiveRegistration: false,
    });

    try {
      const result = await cancelImportedEventFromCalendar(
        fixture.googleCalendarEventId,
      );

      expect(result).toEqual({ cancelled: true });

      const row = await prisma.event.findUniqueOrThrow({
        where: { id: fixture.eventId },
        select: { status: true },
      });
      expect(row.status).toBe(EventStatus.CANCELLED);
      // ガードに掛からなかったので通知は上げない。
      expect(await countBlockedNotifications(fixture.eventId)).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  });

  test("キャンセル済みの申込しか無ければ CANCELLED にする", async () => {
    const fixture = await createEvent({
      status: EventStatus.DRAFT,
      withActiveRegistration: true,
    });

    try {
      await prisma.eventRegistration.updateMany({
        where: { eventId: fixture.eventId },
        data: { status: RegistrationStatus.CANCELLED },
      });

      const result = await cancelImportedEventFromCalendar(
        fixture.googleCalendarEventId,
      );

      expect(result).toEqual({ cancelled: true });
    } finally {
      await fixture.cleanup();
    }
  });

  test("該当 slot が無ければ何もしない", async () => {
    const result = await cancelImportedEventFromCalendar(
      `gcal-import-missing-${crypto.randomUUID()}`,
    );

    expect(result).toEqual({ cancelled: false });
  });
});
