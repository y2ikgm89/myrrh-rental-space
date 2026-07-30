/**
 * posts/category-commands の updatePostCategoryOrder 実 DB 回帰テスト。
 *
 * order-sql.ts の CASE 式 THEN 値に ::int4 キャストが無いと、Postgres が式全体を
 * text と推論し `order`（integer 列）への代入で 42804 を投げる
 * （event-categories/commands.test.ts の updateEventCategoryOrder と同じ回帰対象）。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type CommandsModule = typeof import("@/shared/domain/posts/category-commands");

let prisma: PrismaModule["prisma"];
let updatePostCategoryOrder: CommandsModule["updatePostCategoryOrder"];

describeMaybe("posts/category-commands の reorder", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ updatePostCategoryOrder } =
      await import("@/shared/domain/posts/category-commands"));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("updatePostCategoryOrder は order を並び替える（既存カテゴリーは保持したまま自分の2件を入れ替える）", async () => {
    // updatePostCategoryOrder は「全 PostCategory が過不足なく揃っていること」を
    // 検証するため、対象スコープは全件。ただし PostCategory は Post.categoryId から
    // onDelete: Restrict で参照されるため deleteMany({}) は使えない（既存データが
    // あると P2003 で落ちる）。既存行は保持したまま自分の2行だけ追加して入れ替える。
    const suffix = crypto.randomUUID();
    const existing = await prisma.postCategory.findMany({
      select: { id: true, order: true },
      orderBy: { order: "asc" },
    });
    const baseOrder =
      existing.reduce((max, e) => Math.max(max, e.order), -1) + 1;

    const a = await prisma.postCategory.create({
      data: {
        name: `Repro A ${suffix}`,
        slug: `repro-post-category-a-${suffix}`,
        order: baseOrder,
      },
    });
    const b = await prisma.postCategory.create({
      data: {
        name: `Repro B ${suffix}`,
        slug: `repro-post-category-b-${suffix}`,
        order: baseOrder + 1,
      },
    });

    try {
      await updatePostCategoryOrder([
        ...existing.map((e) => ({ id: e.id, order: e.order })),
        { id: a.id, order: baseOrder + 1 },
        { id: b.id, order: baseOrder },
      ]);

      const rows = await prisma.postCategory.findMany({
        orderBy: { order: "asc" },
      });
      expect(rows.map((r) => r.id)).toEqual([
        ...existing.map((e) => e.id),
        b.id,
        a.id,
      ]);
    } finally {
      await prisma.postCategory.deleteMany({
        where: { id: { in: [a.id, b.id] } },
      });
    }
  });
});
