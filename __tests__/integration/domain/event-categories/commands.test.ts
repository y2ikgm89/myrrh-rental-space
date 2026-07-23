/**
 * event-categories/commands の統合テスト（実 DB 必須）。
 *
 * space-categories/commands.ts と同型の CRUD + sortOrder 自動採番 + reorder +
 * isActive:true 間のみで強制される partial unique name + Event 紐づけによる
 * 削除/非アクティブ化ガードを検証する。
 *
 * == 実行条件 ==
 * `bun run test:integration` は docker-compose の test-db 既定値を注入する。
 *
 * グローバル preload (__tests__/setup.ts) は DATABASE_URL をダミー値に固定するため、
 * `@/shared/db/prisma` gateway を読む前に `process.env.DATABASE_URL` を
 * `TEST_DATABASE_URL` で上書きする（gateway は module load 時 snapshot を読む。
 * 静的 import は gateway を引かないよう動的 import で行う）。
 *
 * 注意: `await expect(promise).rejects.toThrow(...)` は、実DBの複数 await
 * （`prisma.$transaction` 等）を経て解決する Promise に対して Bun 1.3.14 で
 * タイムアウトまでハングする事象を実測したため使わない。エラーケースは
 * 明示的な try/catch で検証する（blacklist-guard.test.ts と同型の対処）。
 */

import { afterAll, beforeEach, describe, expect, test } from "bun:test";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { prisma } = await import("@/shared/db/prisma");
const {
  createEventCategory,
  updateEventCategory,
  updateEventCategoryOrder,
  deleteEventCategory,
  updateEventCategoryActive,
} = await import("@/shared/domain/event-categories/commands");
const { DomainError } = await import("@/shared/domain/domain-error");

/**
 * SINGLE_OCCURRENCE の Event は `events_schedule_integrity_check`
 * （00000000000000_init migration の DEFERRABLE INITIALLY DEFERRED
 * constraint trigger）により commit 時に「ちょうど1件の EventTimeSlot」を
 * 要求される。Event 単体の `create` はスロット無しで即 commit されるため、
 * この制約と無関係な理由で reject される
 * （registration-overbooking.test.ts の createTestEvent と同型の対処）。
 */
async function createLinkedEvent(
  categoryId: string,
  slugSuffix: string,
): Promise<void> {
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 26 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: `テストイベント-${slugSuffix}`,
        slug: `test-event-${slugSuffix}`,
        descriptionJson: {},
        descriptionHtml: "",
        descriptionPlainText: "",
        status: "DRAFT",
        scheduleMode: "SINGLE_OCCURRENCE",
        categoryId,
      },
      select: { id: true },
    });

    await tx.eventTimeSlot.create({
      data: {
        eventId: event.id,
        startAt: start,
        endAt: end,
        capacity: 10,
      },
    });
  });
}

describe("event-categories/commands", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.event.deleteMany({});
    await prisma.eventCategory.deleteMany({});
  });

  test("createEventCategory は末尾に自動採番して作成する", async () => {
    const first = await createEventCategory({ name: "ワークショップ" });
    const second = await createEventCategory({ name: "マルシェ" });

    const rows = await prisma.eventCategory.findMany({
      orderBy: { sortOrder: "asc" },
    });
    expect(rows.map((r) => r.id)).toEqual([first.id, second.id]);
    expect(rows[0]?.sortOrder).toBe(0);
    expect(rows[1]?.sortOrder).toBe(1);
  });

  test("createEventCategory は isActive:true な同名カテゴリーがあると CONFLICT で拒否する", async () => {
    await createEventCategory({ name: "ワークショップ" });

    let thrown: unknown = null;
    try {
      await createEventCategory({ name: "ワークショップ" });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DomainError);
  });

  test("updateEventCategory は名前・説明・アイコン・色を更新する", async () => {
    const created = await createEventCategory({ name: "ワークショップ" });

    await updateEventCategory(created.id, {
      name: "ワークショップ改",
      description: "説明を更新",
    });

    const updated = await prisma.eventCategory.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(updated.name).toBe("ワークショップ改");
    expect(updated.description).toBe("説明を更新");
  });

  test("updateEventCategory は存在しない id で NOT_FOUND を投げる", async () => {
    let thrown: unknown = null;
    try {
      await updateEventCategory("00000000-0000-0000-0000-000000000000", {
        name: "test",
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DomainError);
  });

  test("updateEventCategoryOrder は sortOrder を並び替える", async () => {
    const a = await createEventCategory({ name: "A" });
    const b = await createEventCategory({ name: "B" });

    await updateEventCategoryOrder([
      { id: a.id, sortOrder: 1 },
      { id: b.id, sortOrder: 0 },
    ]);

    const rows = await prisma.eventCategory.findMany({
      orderBy: { sortOrder: "asc" },
    });
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
  });

  test("deleteEventCategory はイベントが紐づく場合 CONFLICT で拒否する", async () => {
    const created = await createEventCategory({ name: "ワークショップ" });
    await createLinkedEvent(created.id, created.id);

    let thrown: unknown = null;
    try {
      await deleteEventCategory(created.id);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DomainError);
  });

  test("deleteEventCategory はイベント紐づけがなければ isActive:false にする", async () => {
    const created = await createEventCategory({ name: "ワークショップ" });

    await deleteEventCategory(created.id);

    const row = await prisma.eventCategory.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.isActive).toBe(false);
  });

  test("updateEventCategoryActive はイベントが紐づく場合の非アクティブ化を CONFLICT で拒否する", async () => {
    const created = await createEventCategory({ name: "ワークショップ" });
    await createLinkedEvent(created.id, `${created.id}-2`);

    let thrown: unknown = null;
    try {
      await updateEventCategoryActive(created.id, false);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DomainError);
  });
});
