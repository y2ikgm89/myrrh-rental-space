/**
 * faq/category-commands の reorderFaqCategories 実 DB 回帰テスト。
 *
 * order-sql.ts の CASE 式 THEN 値に ::int4 キャストが無いと、Postgres が式全体を
 * text と推論し `order`（integer 列）への代入で 42804 を投げる
 * （event-categories/commands.test.ts の updateEventCategoryOrder と同じ回帰対象）。
 */

import { afterAll, beforeEach, describe, expect, test } from "bun:test";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { prisma } = await import("@/shared/db/prisma");
const { reorderFaqCategories } =
  await import("@/shared/domain/faq/category-commands");

describe("faq/category-commands の reorder", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.faqItem.deleteMany({});
    await prisma.faqCategory.deleteMany({});
  });

  test("reorderFaqCategories は order を並び替える", async () => {
    const a = await prisma.faqCategory.create({
      data: { name: "Repro A", slug: "repro-faq-category-a", order: 0 },
    });
    const b = await prisma.faqCategory.create({
      data: { name: "Repro B", slug: "repro-faq-category-b", order: 1 },
    });

    await reorderFaqCategories([b.id, a.id]);

    const rows = await prisma.faqCategory.findMany({
      orderBy: { order: "asc" },
    });
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
  });
});
