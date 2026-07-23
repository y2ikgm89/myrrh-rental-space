/**
 * space-categories/commands の実 DB 回帰テスト。
 *
 * order-sql.ts の CASE 式 THEN 値に ::int4 キャストが無いと、Postgres が式全体を
 * text と推論し `sortOrder`（integer 列）への代入で 42804 を投げる
 * （event-categories/commands.test.ts の updateEventCategoryOrder と同じ回帰対象）。
 *
 * == 実行条件 ==
 * `bun run test:integration` は docker-compose の test-db 既定値を注入する。
 * preload (__tests__/setup.ts) が DATABASE_URL をダミー値に固定するため、
 * `@/shared/db/prisma` gateway を読む前に TEST_DATABASE_URL で上書きする。
 */

import { afterAll, beforeEach, describe, expect, test } from "bun:test";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { prisma } = await import("@/shared/db/prisma");
const { createSpaceCategory, updateSpaceCategoryOrder } =
  await import("@/shared/domain/space-categories/commands");

describe("space-categories/commands の reorder", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // updateSpaceCategoryOrder は「全 SpaceCategory が過不足なく揃っていること」を
    // 検証するため、テーブル全体を対象にする（event-categories/commands.test.ts と同型）。
    await prisma.spaceCategory.deleteMany({});
  });

  test("updateSpaceCategoryOrder は sortOrder を並び替える", async () => {
    const a = await createSpaceCategory({ name: "A" });
    const b = await createSpaceCategory({ name: "B" });

    await updateSpaceCategoryOrder([
      { id: a.id, sortOrder: 1 },
      { id: b.id, sortOrder: 0 },
    ]);

    const rows = await prisma.spaceCategory.findMany({
      orderBy: { sortOrder: "asc" },
    });
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
  });
});
