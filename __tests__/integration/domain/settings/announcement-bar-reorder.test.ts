/**
 * settings/announcement-bar の reorderAnnouncementBars 実 DB 回帰テスト。
 *
 * order-sql.ts の CASE 式 THEN 値に ::int4 キャストが無いと、Postgres が式全体を
 * text と推論し `displayOrder`（integer 列）への代入で 42804 を投げる
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
type CommandsModule =
  typeof import("@/shared/domain/settings/announcement-bar");

let prisma: PrismaModule["prisma"];
let reorderAnnouncementBars: CommandsModule["reorderAnnouncementBars"];

describeMaybe("settings/announcement-bar の reorder", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ reorderAnnouncementBars } =
      await import("@/shared/domain/settings/announcement-bar"));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.announcementBar.deleteMany({});
  });

  test("reorderAnnouncementBars は displayOrder を並び替える", async () => {
    const a = await prisma.announcementBar.create({
      data: {
        message: [{ _key: "k", _type: "span", text: "A" }],
        displayOrder: 0,
      },
    });
    const b = await prisma.announcementBar.create({
      data: {
        message: [{ _key: "k", _type: "span", text: "B" }],
        displayOrder: 1,
      },
    });

    await reorderAnnouncementBars([b.id, a.id]);

    const rows = await prisma.announcementBar.findMany({
      orderBy: { displayOrder: "asc" },
    });
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
  });
});
