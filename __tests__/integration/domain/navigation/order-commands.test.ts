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

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
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

  beforeEach(async () => {
    // updateNavigationOrder は「同一 type の全件が過不足なく揃っていること」を
    // 検証するため、他 type（HEADER_MOBILE/FOOTER）を残しつつ本テスト対象の
    // HEADER_DESKTOP のみを一掃する（テーブル全体の無条件 deleteMany は避ける）。
    await prisma.navigationItem.deleteMany({
      where: { type: NavigationType.HEADER_DESKTOP },
    });
  });

  test("updateNavigationOrder は order を並び替える", async () => {
    const label = [{ _key: "k", _type: "span", text: "リンク" }];
    const a = await prisma.navigationItem.create({
      data: {
        type: NavigationType.HEADER_DESKTOP,
        label,
        url: "/repro-nav-a",
        order: 0,
      },
    });
    const b = await prisma.navigationItem.create({
      data: {
        type: NavigationType.HEADER_DESKTOP,
        label,
        url: "/repro-nav-b",
        order: 1,
      },
    });

    await updateNavigationOrder([
      { id: a.id, order: 1 },
      { id: b.id, order: 0 },
    ]);

    // 永続 test-db に HEADER_MOBILE/FOOTER の行が残っている場合があるため、
    // 検証は本テストが並び替えた HEADER_DESKTOP のみに絞る
    // （updateNavigationOrder / beforeEach と同じスコープ）。
    const rows = await prisma.navigationItem.findMany({
      where: { type: NavigationType.HEADER_DESKTOP },
      orderBy: { order: "asc" },
    });
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
  });
});
