/**
 * locations/commands の updateLocationOrder 実 DB 回帰テスト。
 *
 * order-sql.ts の CASE 式 THEN 値に ::int4 キャストが無いと、Postgres が式全体を
 * text と推論し `sortOrder`（integer 列）への代入で 42804 を投げる
 * （event-categories/commands.test.ts の updateEventCategoryOrder と同じ回帰対象）。
 *
 * createLocation は画像 URL の許可済みソース検証を通す必要があるため、
 * セットアップは prisma.location.create を直接使う（reorder 本体の検証に無関係な
 * 依存を避ける）。
 *
 * Location は他の統合テスト（予約/スペース系フィクスチャ）から Space の
 * Restrict FK で参照されうる共有テーブルのため、無条件 deleteMany はできない。
 * updateLocationOrder は「isActive:true な Location が過不足なく揃っていること」を
 * 検証するため、本テスト専用の2件だけを削除しつつ、呼び出し時は既存の
 * アクティブ Location 全件（現在の sortOrder のまま）+ 本テストの2件を渡す。
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
type CommandsModule = typeof import("@/shared/domain/locations/commands");

let prisma: PrismaModule["prisma"];
let updateLocationOrder: CommandsModule["updateLocationOrder"];

describeMaybe("locations/commands の reorder", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ updateLocationOrder } =
      await import("@/shared/domain/locations/commands"));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.location.deleteMany({
      where: { slug: { startsWith: "repro-location-" } },
    });
  });

  test("updateLocationOrder は sortOrder を並び替える", async () => {
    const others = await prisma.location.findMany({
      where: { isActive: true },
      select: { id: true, sortOrder: true },
    });
    const nextSortOrder =
      others.reduce((max, o) => Math.max(max, o.sortOrder), -1) + 1;

    const a = await prisma.location.create({
      data: {
        slug: "repro-location-a",
        name: "Repro Location A",
        address: "東京都渋谷区1-1-1",
        imageUrl: "https://example.com/a.jpg",
        sortOrder: nextSortOrder,
      },
    });
    const b = await prisma.location.create({
      data: {
        slug: "repro-location-b",
        name: "Repro Location B",
        address: "東京都渋谷区2-2-2",
        imageUrl: "https://example.com/b.jpg",
        sortOrder: nextSortOrder + 1,
      },
    });

    // isActive:true な Location 全件を過不足なく渡す必要があるため、他テスト由来の
    // 既存アクティブ Location は現在の sortOrder のまま含め、本テストの2件だけ入れ替える。
    await updateLocationOrder([
      ...others.map((o) => ({ id: o.id, sortOrder: o.sortOrder })),
      { id: a.id, sortOrder: b.sortOrder },
      { id: b.id, sortOrder: a.sortOrder },
    ]);

    const rows = await prisma.location.findMany({
      where: { id: { in: [a.id, b.id] } },
      orderBy: { sortOrder: "asc" },
    });
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
  });
});
