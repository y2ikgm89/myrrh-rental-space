/**
 * events/commands の updateEventCommand 内チケット並び替え実 DB 回帰テスト。
 *
 * order-sql.ts の CASE 式 THEN 値に ::int4 キャストが無いと、Postgres が式全体を
 * text と推論し `sortOrder`（integer 列）への代入で 42804 を投げる
 * （event-categories/commands.test.ts の updateEventCategoryOrder と同じ回帰対象）。
 * events/commands.ts はこの中で唯一 buildTextOrderSqlFragments（uuid キャスト無し版）
 * を使う経路（EventTicket.id は cuid の VarChar）。
 *
 * SINGLE_OCCURRENCE の Event は `events_schedule_integrity_check`
 * （00000000000000_init migration の DEFERRABLE INITIALLY DEFERRED constraint trigger）
 * により commit 時に「ちょうど1件の EventTimeSlot」を要求されるため、
 * Event 作成は EventTimeSlot と同一 tx で行う。
 */

import { afterAll, beforeEach, describe, expect, test } from "bun:test";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { prisma } = await import("@/shared/db/prisma");
const { updateEventCommand } = await import("@/shared/domain/events/commands");
const { EventStatus, EventScheduleMode } =
  await import("@/shared/lib/validations/enums/prisma-types");

describe("events/commands のチケット reorder", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Prisma の deleteMany は個別 autocommit 文のため、先に eventTimeSlot だけを
    // 削除すると「親 Event（SINGLE_OCCURRENCE）が残ったまま slot_count=0」の瞬間に
    // DEFERRABLE constraint trigger が単文末で発火し 23514 を投げる。
    // event.deleteMany の onDelete: Cascade で子行を同一文内でまとめて消す。
    await prisma.event.deleteMany({});
  });

  test("updateEventCommand はチケットの sortOrder を並び替える", async () => {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 26 * 60 * 60 * 1000);

    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          title: "Repro Event",
          slug: "repro-ticket-reorder-event",
          descriptionJson: {},
          descriptionHtml: "",
          descriptionPlainText: "",
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

    const ticketA = await prisma.eventTicket.create({
      data: { eventId: event.id, name: "A", price: 1000, sortOrder: 0 },
    });
    const ticketB = await prisma.eventTicket.create({
      data: { eventId: event.id, name: "B", price: 1000, sortOrder: 1 },
    });

    await updateEventCommand(event.id, {
      title: "Repro Event",
      slug: "repro-ticket-reorder-event",
      descriptionJson: {},
      descriptionHtml: "",
      descriptionPlainText: "",
      gallery: [],
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
  });
});
