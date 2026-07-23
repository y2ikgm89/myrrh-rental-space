/**
 * sections/commands の reorderPageSectionsCommand 実 DB 回帰テスト。
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
type CommandsModule = typeof import("@/shared/domain/sections/commands");

let prisma: PrismaModule["prisma"];
let reorderPageSectionsCommand: CommandsModule["reorderPageSectionsCommand"];

describeMaybe("sections/commands の reorder", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ reorderPageSectionsCommand } =
      await import("@/shared/domain/sections/commands"));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // 無条件 deleteMany は他テストの Page fixture を巻き込むため、
    // 本テスト専用の slug のみを対象にする（cascade で配下 Section も削除される）。
    await prisma.page.deleteMany({
      where: { slug: "repro-sections-page" },
    });
  });

  test("reorderPageSectionsCommand は order を並び替える", async () => {
    const page = await prisma.page.create({
      data: {
        slug: "repro-sections-page",
        title: "Repro Page",
        template: "custom",
      },
    });
    const a = await prisma.section.create({
      data: { pageId: page.id, type: "richText", order: 0 },
    });
    const b = await prisma.section.create({
      data: { pageId: page.id, type: "richText", order: 1 },
    });

    await reorderPageSectionsCommand({
      pageId: page.id,
      orderedIds: [b.id, a.id],
    });

    const rows = await prisma.section.findMany({
      where: { pageId: page.id },
      orderBy: { order: "asc" },
    });
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
  });
});
