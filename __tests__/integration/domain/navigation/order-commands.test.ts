/**
 * navigation/commands の updateNavigationOrder 実 DB 回帰テスト。
 *
 * order-sql.ts の CASE 式 THEN 値に ::int4 キャストが無いと、Postgres が式全体を
 * text と推論し `order`（integer 列）への代入で 42804 を投げる
 * （event-categories/commands.test.ts の updateEventCategoryOrder と同じ回帰対象）。
 */

import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { NavigationType } from "@generated/prisma/enums";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { prisma } = await import("@/shared/db/prisma");
const { updateNavigationOrder } =
  await import("@/shared/domain/navigation/commands");

describe("navigation/commands の reorder", () => {
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

    const rows = await prisma.navigationItem.findMany({
      orderBy: { order: "asc" },
    });
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
  });
});
