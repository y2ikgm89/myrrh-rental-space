/**
 * faq/category-commands の reorderFaqCategories 実 DB 回帰テスト。
 *
 * order-sql.ts の CASE 式 THEN 値に ::int4 キャストが無いと、Postgres が式全体を
 * text と推論し `order`（integer 列）への代入で 42804 を投げる
 * （event-categories/commands.test.ts の updateEventCategoryOrder と同じ回帰対象）。
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
type CommandsModule = typeof import("@/shared/domain/faq/category-commands");

let prisma: PrismaModule["prisma"];
let reorderFaqCategories: CommandsModule["reorderFaqCategories"];

describeMaybe("faq/category-commands の reorder", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ reorderFaqCategories } =
      await import("@/shared/domain/faq/category-commands"));
  });

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
