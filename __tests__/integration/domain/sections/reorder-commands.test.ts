/**
 * sections/commands の reorderPageSectionsCommand 実 DB 回帰テスト。
 *
 * order-sql.ts の CASE 式 THEN 値に ::int4 キャストが無いと、Postgres が式全体を
 * text と推論し `order`（integer 列）への代入で 42804 を投げる
 * （event-categories/commands.test.ts の updateEventCategoryOrder と同じ回帰対象）。
 */

import { afterAll, beforeEach, describe, expect, test } from "bun:test";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { prisma } = await import("@/shared/db/prisma");
const { reorderPageSectionsCommand } =
  await import("@/shared/domain/sections/commands");

describe("sections/commands の reorder", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // 無条件 deleteMany は他テストの Page fixture を巻き込むため、
    // 本テスト専用の slug のみを対象にする（cascade で配下 Section も削除される）。
    await prisma.page.deleteMany({
      where: { slug: "repro-sections-page" },
    });
  });

  test("reorderPageSectionsCommand は order を並び替える", async () => {
    const page = await prisma.page.create({
      data: {
        slug: "repro-sections-page",
        title: "Repro Page",
        template: "custom",
      },
    });
    const a = await prisma.section.create({
      data: { pageId: page.id, type: "richText", order: 0 },
    });
    const b = await prisma.section.create({
      data: { pageId: page.id, type: "richText", order: 1 },
    });

    await reorderPageSectionsCommand({
      pageId: page.id,
      orderedIds: [b.id, a.id],
    });

    const rows = await prisma.section.findMany({
      where: { pageId: page.id },
      orderBy: { order: "asc" },
    });
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
  });
});
