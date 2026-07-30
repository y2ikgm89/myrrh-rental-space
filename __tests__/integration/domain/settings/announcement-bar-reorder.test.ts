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

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

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

  test("reorderAnnouncementBars は displayOrder を並び替える（既存お知らせバーは保持したまま自分の2件を入れ替える）", async () => {
    // reorderAnnouncementBars は全 AnnouncementBar が過不足なく揃っていることを
    // 検証するため、対象スコープは全件。deleteMany({}) は seed 済みの実
    // お知らせバーを問答無用で破壊し以降の seed 実行を壊すため使わない。
    // 既存行は保持したまま自分の2行だけ追加して入れ替える。
    // displayOrder は無条件 @@unique（ソフトデリート概念なし）。過去の削除で
    // 欠番が生じている可能性があるため existing.length ではなく既存最大値の
    // 次を使う（0..N-1 への詰め直しは reorderAnnouncementBars 自体が行う）。
    const existing = await prisma.announcementBar.findMany({
      orderBy: { displayOrder: "asc" },
      select: { id: true },
    });
    const maxOrder = await prisma.announcementBar.aggregate({
      _max: { displayOrder: true },
    });
    const baseOrder = (maxOrder._max.displayOrder ?? -1) + 1;

    const a = await prisma.announcementBar.create({
      data: {
        message: [{ _key: "k", _type: "span", text: "A" }],
        displayOrder: baseOrder,
      },
    });
    const b = await prisma.announcementBar.create({
      data: {
        message: [{ _key: "k", _type: "span", text: "B" }],
        displayOrder: baseOrder + 1,
      },
    });

    try {
      await reorderAnnouncementBars([...existing.map((e) => e.id), b.id, a.id]);

      const rows = await prisma.announcementBar.findMany({
        orderBy: { displayOrder: "asc" },
      });
      expect(rows.map((r) => r.id)).toEqual([
        ...existing.map((e) => e.id),
        b.id,
        a.id,
      ]);
    } finally {
      await prisma.announcementBar.deleteMany({
        where: { id: { in: [a.id, b.id] } },
      });
    }
  });
});
