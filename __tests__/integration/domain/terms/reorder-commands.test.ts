/**
 * terms/commands の reorderTermsCommand 実 DB 回帰テスト。
 *
 * order-sql.ts の CASE 式 THEN 値に ::int4 キャストが無いと、Postgres が式全体を
 * text と推論し `displayOrder`（integer 列）への代入で 42804 を投げる
 * （event-categories/commands.test.ts の updateEventCategoryOrder と同じ回帰対象）。
 */

import { afterAll, beforeEach, describe, expect, test } from "bun:test";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { prisma } = await import("@/shared/db/prisma");
const { reorderTermsCommand } = await import("@/shared/domain/terms/commands");

describe("terms/commands の reorder", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // reorderTermsCommand は「全 TermsDocument（未削除）が過不足なく揃っていること」を
    // 検証するため、テーブル全体を対象にする（event-categories/commands.test.ts と同型）。
    await prisma.termsDocument.deleteMany({});
  });

  test("reorderTermsCommand は displayOrder を並び替える", async () => {
    const a = await prisma.termsDocument.create({
      data: {
        type: "GENERAL",
        slug: "repro-terms-a",
        title: "規約A",
        contentJson: {},
        contentHtml: "<p>A</p>",
        scopes: [],
        displayOrder: 0,
      },
    });
    const b = await prisma.termsDocument.create({
      data: {
        type: "GENERAL",
        slug: "repro-terms-b",
        title: "規約B",
        contentJson: {},
        contentHtml: "<p>B</p>",
        scopes: [],
        displayOrder: 1,
      },
    });

    await reorderTermsCommand([b.id, a.id]);

    const rows = await prisma.termsDocument.findMany({
      orderBy: { displayOrder: "asc" },
    });
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
  });
});
