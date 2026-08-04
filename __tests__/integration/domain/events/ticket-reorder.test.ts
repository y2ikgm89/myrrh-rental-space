/**
 * events/commands の updateEventCommand 内チケット並び替え実 DB 回帰テスト。
 *
 * order-sql.ts の CASE 式 THEN 値に ::int4 キャストが無いと、Postgres が式全体を
 * text と推論し `sortOrder`（integer 列）への代入で 42804 を投げる
 * （event-categories/commands.test.ts の updateEventCategoryOrder と同じ回帰対象）。
 * 以前この経路だけがキャスト無しの buildTextOrderSqlFragments を使っていたが、
 * EventTicket.id は uuid なので他の並び替え面と同じ buildUuidOrderSqlFragments に
 * 統一した（text 版は削除済み）。
 *
 * SINGLE_OCCURRENCE の Event は `events_schedule_integrity_check`
 * （00000000000000_init migration の DEFERRABLE INITIALLY DEFERRED constraint trigger）
 * により commit 時に「ちょうど1件の EventTimeSlot」を要求されるため、
 * Event 作成は EventTimeSlot と同一 tx で行う。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type CommandsModule = typeof import("@/shared/domain/events/commands");
type PrismaTypesModule =
  typeof import("@/shared/lib/validations/enums/prisma-types");

let prisma: PrismaModule["prisma"];
let updateEventCommand: CommandsModule["updateEventCommand"];
let EventStatus: PrismaTypesModule["EventStatus"];
let EventScheduleMode: PrismaTypesModule["EventScheduleMode"];
let testCategoryId: string;

describeMaybe("events/commands のチケット reorder", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ updateEventCommand } = await import("@/shared/domain/events/commands"));
    ({ EventStatus, EventScheduleMode } =
      await import("@/shared/lib/validations/enums/prisma-types"));

    // Event.categoryId は必須 FK (EventCategory 追加, #1434)。export-queries-
    // cross-event.test.ts と同じパターンで専用カテゴリーを用意する。sortOrder は
    // テーブル全体でユニーク制約があるため、並行実行する他の integration test
    // ファイルの EventCategory 行と衝突しない乱数域を使う。
    const category = await prisma.eventCategory.create({
      data: {
        name: `Ticket Reorder Test Category ${crypto.randomUUID()}`,
        sortOrder: 10_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    testCategoryId = category.id;
  });

  afterAll(async () => {
    // 自分専用の testCategoryId に紐づく event のみを掃除する（グローバルな
    // event.deleteMany({}) は seed 済みの実イベントを問答無用で破壊するため使わない）。
    await prisma.event.deleteMany({ where: { categoryId: testCategoryId } });
    await prisma.eventCategory.deleteMany({ where: { id: testCategoryId } });
    await prisma.$disconnect();
  });

  test("updateEventCommand はチケットの sortOrder を並び替える", async () => {
    const suffix = crypto.randomUUID();
    const slug = `repro-ticket-reorder-event-${suffix}`;
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 26 * 60 * 60 * 1000);

    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          title: "Repro Event",
          slug,
          descriptionJson: {},
          descriptionHtml: "",
          descriptionPlainText: "",
          categoryId: testCategoryId,
          status: "DRAFT",
          scheduleMode: "SINGLE_OCCURRENCE",
        },
        select: { id: true },
      });
      await tx.eventTimeSlot.create({
        data: { eventId: created.id, startAt: start, endAt: end, capacity: 10 },
      });
      return created;
    });

    try {
      const ticketA = await prisma.eventTicket.create({
        data: { eventId: event.id, name: "A", price: 1000, sortOrder: 0 },
      });
      const ticketB = await prisma.eventTicket.create({
        data: { eventId: event.id, name: "B", price: 1000, sortOrder: 1 },
      });

      await updateEventCommand(event.id, {
        title: "Repro Event",
        slug,
        descriptionJson: {},
        descriptionHtml: "",
        descriptionPlainText: "",
        gallery: [],
        categoryId: testCategoryId,
        status: EventStatus.DRAFT,
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        slots: [{ startAt: start, endAt: end, capacity: 10 }],
        tickets: [
          {
            id: ticketB.id,
            name: "B",
            description: null,
            price: 1000,
            capacity: null,
            unitSize: 1,
            isAvailable: true,
          },
          {
            id: ticketA.id,
            name: "A",
            description: null,
            price: 1000,
            capacity: null,
            unitSize: 1,
            isAvailable: true,
          },
        ],
      });

      const rows = await prisma.eventTicket.findMany({
        where: { eventId: event.id },
        orderBy: { sortOrder: "asc" },
      });
      expect(rows.map((r) => r.id)).toEqual([ticketB.id, ticketA.id]);
    } finally {
      await prisma.event.deleteMany({ where: { id: event.id } });
    }
  });
});
