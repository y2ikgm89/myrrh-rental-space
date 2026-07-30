/**
 * navigation/commands の updateNavigationOrder 実 DB 回帰テスト。
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
import { NavigationType } from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type CommandsModule = typeof import("@/shared/domain/navigation/commands");

let prisma: PrismaModule["prisma"];
let updateNavigationOrder: CommandsModule["updateNavigationOrder"];

describeMaybe("navigation/commands の reorder", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ updateNavigationOrder } =
      await import("@/shared/domain/navigation/commands"));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("updateNavigationOrder は order を並び替える（既存 HEADER_DESKTOP は保持したまま自分の2件を入れ替える）", async () => {
    // updateNavigationOrder は「同一 type の全件が過不足なく揃っていること」を
    // 検証するため、対象スコープは同一 type 全件。HEADER_DESKTOP には seed 済みの
    // 本物のナビゲーション項目（/, /spaces 等）が既に存在しうるため、type 全体の
    // deleteMany は使わない（削除後に復元しないと、以降の seed 実行が
    // findFirst(type,url) で既存判定できず (type, order) 一意制約違反を起こす）。
    // 既存行は保持したまま自分の2行だけ追加して入れ替える。
    const label = [{ _key: "k", _type: "span", text: "リンク" }];
    const suffix = crypto.randomUUID();
    const existing = await prisma.navigationItem.findMany({
      where: { type: NavigationType.HEADER_DESKTOP },
      select: { id: true, order: true },
      orderBy: { order: "asc" },
    });
    const baseOrder =
      existing.reduce((max, e) => Math.max(max, e.order), -1) + 1;

    const a = await prisma.navigationItem.create({
      data: {
        type: NavigationType.HEADER_DESKTOP,
        label,
        url: `/repro-nav-a-${suffix}`,
        order: baseOrder,
      },
    });
    const b = await prisma.navigationItem.create({
      data: {
        type: NavigationType.HEADER_DESKTOP,
        label,
        url: `/repro-nav-b-${suffix}`,
        order: baseOrder + 1,
      },
    });

    try {
      await updateNavigationOrder([
        ...existing.map((e) => ({ id: e.id, order: e.order })),
        { id: a.id, order: baseOrder + 1 },
        { id: b.id, order: baseOrder },
      ]);

      const rows = await prisma.navigationItem.findMany({
        where: { type: NavigationType.HEADER_DESKTOP },
        orderBy: { order: "asc" },
      });
      expect(rows.map((r) => r.id)).toEqual([
        ...existing.map((e) => e.id),
        b.id,
        a.id,
      ]);
    } finally {
      await prisma.navigationItem.deleteMany({
        where: { id: { in: [a.id, b.id] } },
      });
    }
  });
});
