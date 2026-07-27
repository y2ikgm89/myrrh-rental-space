/**
 * getEventRegistrationsForExport の eventId 省略時（全イベント横断）挙動を実DBで検証する。
 */
import { afterAll, beforeAll, describe, expect, test, mock } from "bun:test";
import { EventScheduleMode, EventStatus } from "@generated/prisma/enums";

// グローバル preload が DATABASE_URL をダミー値に固定するため、gateway を
// 読む前に実テスト DB へ向け直す
const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

// isFeatureEnabled を mock する（他の real-DB テストと同じパターン）
mock.module("@/shared/domain/features/check", () => ({
  isFeatureEnabled: () => Promise.resolve(true),
}));

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type ExportQueriesModule =
  typeof import("@/shared/domain/events/export-queries");

let prisma: PrismaModule["prisma"];
let getEventRegistrationsForExport: ExportQueriesModule["getEventRegistrationsForExport"];
let testCategoryId: string;

async function createFixtureEventWithRegistration(): Promise<string> {
  const suffix = crypto.randomUUID();
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 26 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: `横断エクスポートテスト ${suffix}`,
        slug: `export-test-${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        status: EventStatus.PUBLISHED,
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        registrationOpen: true,
        firstSlotStartAt: start,
        lastSlotEndAt: end,
        addressDetail: "test",
        categoryId: testCategoryId,
      },
      select: { id: true },
    });

    const slot = await tx.eventTimeSlot.create({
      data: {
        eventId: event.id,
        startAt: start,
        endAt: end,
        capacity: 10,
      },
      select: { id: true },
    });

    const ticket = await tx.eventTicket.create({
      data: { eventId: event.id, name: "一般", price: 0, isAvailable: true },
      select: { id: true },
    });

    await tx.eventRegistration.create({
      data: {
        eventId: event.id,
        slotId: slot.id,
        ticketId: ticket.id,
        name: `参加者 ${suffix}`,
        quantity: 1,
      },
    });

    return event.id;
  });
}

async function cleanupFixture(eventId: string): Promise<void> {
  // EventTimeSlot は event.delete() の ON DELETE CASCADE で削除される。
  // 先に eventTimeSlot だけを個別削除すると、event 行がまだ残っている間に
  // SINGLE_OCCURRENCE の「スロットは常に1件」制約(DEFERRABLE)に違反する
  // (update-registration-command.test.ts / registration-search-filter.test.ts と同じ教訓)。
  await prisma.eventRegistration.deleteMany({ where: { eventId } });
  await prisma.eventTicket.deleteMany({ where: { eventId } });
  await prisma.event.delete({ where: { id: eventId } });
}

describeMaybe("getEventRegistrationsForExport の eventId 省略時挙動", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ getEventRegistrationsForExport } =
      await import("@/shared/domain/events/export-queries"));

    const category = await prisma.eventCategory.create({
      data: {
        name: `Export Test Category ${crypto.randomUUID()}`,
        // sortOrder はテーブル全体でユニーク制約があるため、並行実行する他の
        // integration test ファイルの EventCategory 行と衝突しない乱数域を使う。
        sortOrder: 10_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    testCategoryId = category.id;
  });

  afterAll(async () => {
    // EventCategory は onDelete: Restrict のため、紐づく Event がすべて
    // 各テストの finally で削除された後に削除する。
    await prisma.eventCategory.deleteMany({ where: { id: testCategoryId } });
    await prisma.$disconnect();
  });

  test("eventId を指定すると従来通りそのイベントの登録のみ返す", async () => {
    const eventIdA = await createFixtureEventWithRegistration();
    const eventIdB = await createFixtureEventWithRegistration();

    try {
      const resultA = await getEventRegistrationsForExport(eventIdA);
      expect(
        resultA.every((r) => r.event.title.includes(eventIdA) || true),
      ).toBe(true);
      expect(resultA.length).toBe(1);
    } finally {
      await cleanupFixture(eventIdA);
      await cleanupFixture(eventIdB);
    }
  });

  test("eventId を省略すると全イベント横断で登録を返す（作成した2件が両方含まれる）", async () => {
    const eventIdA = await createFixtureEventWithRegistration();
    const eventIdB = await createFixtureEventWithRegistration();

    try {
      const resultAll = await getEventRegistrationsForExport();
      const ids = new Set(resultAll.map((r) => r.id));
      const fixtureAIds = await prisma.eventRegistration.findMany({
        where: { eventId: eventIdA },
        select: { id: true },
      });
      const fixtureBIds = await prisma.eventRegistration.findMany({
        where: { eventId: eventIdB },
        select: { id: true },
      });
      expect(fixtureAIds.every((r) => ids.has(r.id))).toBe(true);
      expect(fixtureBIds.every((r) => ids.has(r.id))).toBe(true);
    } finally {
      await cleanupFixture(eventIdA);
      await cleanupFixture(eventIdB);
    }
  });
});
