/**
 * faq/item-commands の reorderFaqItems 実 DB 回帰テスト。
 *
 * order-sql.ts の CASE 式 THEN 値に ::int4 キャストが無いと、Postgres が式全体を
 * text と推論し `order`（integer 列）への代入で 42804 を投げる
 * （event-categories/commands.test.ts の updateEventCategoryOrder と同じ回帰対象）。
 */

import { afterAll, beforeEach, describe, expect, test } from "bun:test";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { prisma } = await import("@/shared/db/prisma");
const { reorderFaqItems } = await import("@/shared/domain/faq/item-commands");

describe("faq/item-commands の reorder", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.faqItem.deleteMany({});
    await prisma.faqCategory.deleteMany({});
  });

  test("reorderFaqItems は order を並び替える", async () => {
    const category = await prisma.faqCategory.create({
      data: { name: "Repro Category", slug: "repro-faq-item-category" },
    });
    const a = await prisma.faqItem.create({
      data: {
        categoryId: category.id,
        question: "質問A",
        answer: "回答A",
        order: 0,
      },
    });
    const b = await prisma.faqItem.create({
      data: {
        categoryId: category.id,
        question: "質問B",
        answer: "回答B",
        order: 1,
      },
    });

    await reorderFaqItems(category.id, [
      { id: a.id, order: 1 },
      { id: b.id, order: 0 },
    ]);

    const rows = await prisma.faqItem.findMany({
      where: { categoryId: category.id },
      orderBy: { order: "asc" },
    });
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
  });
});
