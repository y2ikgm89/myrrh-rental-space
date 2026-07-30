/**
 * space-categories/commands の実 DB 回帰テスト。
 *
 * order-sql.ts の CASE 式 THEN 値に ::int4 キャストが無いと、Postgres が式全体を
 * text と推論し `sortOrder`（integer 列）への代入で 42804 を投げる
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
type CommandsModule =
  typeof import("@/shared/domain/space-categories/commands");

let prisma: PrismaModule["prisma"];
let createSpaceCategory: CommandsModule["createSpaceCategory"];
let updateSpaceCategoryOrder: CommandsModule["updateSpaceCategoryOrder"];

describeMaybe("space-categories/commands の reorder", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ createSpaceCategory, updateSpaceCategoryOrder } =
      await import("@/shared/domain/space-categories/commands"));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("updateSpaceCategoryOrder は sortOrder を並び替える（既存カテゴリーは保持したまま自分の2件を入れ替える）", async () => {
    // updateSpaceCategoryOrder は「全 SpaceCategory が過不足なく揃っていること」を
    // 検証するため、対象スコープは全件。ただし SpaceCategory は Space.categoryId から
    // onDelete: Restrict で参照されるため deleteMany({}) は使えない（既存データが
    // あると P2003 で落ちる）。既存行は保持したまま自分の2行だけ追加して入れ替える。
    const suffix = crypto.randomUUID();
    const existing = await prisma.spaceCategory.findMany({
      select: { id: true, sortOrder: true },
    });

    const a = await createSpaceCategory({ name: `Repro A ${suffix}` });
    const b = await createSpaceCategory({ name: `Repro B ${suffix}` });
    const aRow = await prisma.spaceCategory.findUniqueOrThrow({
      where: { id: a.id },
      select: { sortOrder: true },
    });
    const bRow = await prisma.spaceCategory.findUniqueOrThrow({
      where: { id: b.id },
      select: { sortOrder: true },
    });

    try {
      await updateSpaceCategoryOrder([
        ...existing.map((e) => ({ id: e.id, sortOrder: e.sortOrder })),
        { id: a.id, sortOrder: bRow.sortOrder },
        { id: b.id, sortOrder: aRow.sortOrder },
      ]);

      const rows = await prisma.spaceCategory.findMany({
        orderBy: { sortOrder: "asc" },
      });
      expect(rows.map((r) => r.id)).toEqual([
        ...existing.map((e) => e.id),
        b.id,
        a.id,
      ]);
    } finally {
      await prisma.spaceCategory.deleteMany({
        where: { id: { in: [a.id, b.id] } },
      });
    }
  });
});
