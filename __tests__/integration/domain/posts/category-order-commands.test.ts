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

  beforeEach(async () => {
    // updatePostCategoryOrder は「全 PostCategory が過不足なく揃っていること」を
    // 検証するため、テーブル全体を対象にする（event-categories/commands.test.ts と同型）。
    await prisma.postCategory.deleteMany({});
  });

  test("updatePostCategoryOrder は order を並び替える", async () => {
    const a = await prisma.postCategory.create({
      data: { name: "Repro A", slug: "repro-post-category-a", order: 0 },
    });
    const b = await prisma.postCategory.create({
      data: { name: "Repro B", slug: "repro-post-category-b", order: 1 },
    });

    await updatePostCategoryOrder([
      { id: a.id, order: 1 },
      { id: b.id, order: 0 },
    ]);

    const rows = await prisma.postCategory.findMany({
      orderBy: { order: "asc" },
    });
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
  });
});
