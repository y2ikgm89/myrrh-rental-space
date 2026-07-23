/**
 * settings/announcement-bar の reorderAnnouncementBars 実 DB 回帰テスト。
 *
 * order-sql.ts の CASE 式 THEN 値に ::int4 キャストが無いと、Postgres が式全体を
 * text と推論し `displayOrder`（integer 列）への代入で 42804 を投げる
 * （event-categories/commands.test.ts の updateEventCategoryOrder と同じ回帰対象）。
 */

import { afterAll, beforeEach, describe, expect, test } from "bun:test";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { prisma } = await import("@/shared/db/prisma");
const { reorderAnnouncementBars } =
  await import("@/shared/domain/settings/announcement-bar");

describe("settings/announcement-bar の reorder", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.announcementBar.deleteMany({});
  });

  test("reorderAnnouncementBars は displayOrder を並び替える", async () => {
    const a = await prisma.announcementBar.create({
      data: {
        message: [{ _key: "k", _type: "span", text: "A" }],
        displayOrder: 0,
      },
    });
    const b = await prisma.announcementBar.create({
      data: {
        message: [{ _key: "k", _type: "span", text: "B" }],
        displayOrder: 1,
      },
    });

    await reorderAnnouncementBars([b.id, a.id]);

    const rows = await prisma.announcementBar.findMany({
      orderBy: { displayOrder: "asc" },
    });
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
  });
});
