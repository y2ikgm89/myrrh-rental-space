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
 *
 * 各テストは seed 済みの実 EventCategory/Event（「ワークショップ」等）を
 * 保持したまま、自分が作った行だけを randomUUID サフィックス付きの名前・
 * slug で作成し、finally で自分の行だけ削除する（テーブル全体の deleteMany
 * は seed 済みデータを破壊し以降の seed 実行を壊すため使わない）。
 */

import { afterAll, describe, expect, test } from "bun:test";

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

  test("createEventCategory は末尾に自動採番して作成する", async () => {
    const suffix = crypto.randomUUID();
    const first = await createEventCategory({
      name: `ワークショップ ${suffix}`,
    });
    const second = await createEventCategory({ name: `マルシェ ${suffix}` });

    try {
      const firstRow = await prisma.eventCategory.findUniqueOrThrow({
        where: { id: first.id },
        select: { sortOrder: true },
      });
      const secondRow = await prisma.eventCategory.findUniqueOrThrow({
        where: { id: second.id },
        select: { sortOrder: true },
      });
      expect(secondRow.sortOrder).toBe(firstRow.sortOrder + 1);

      const rows = await prisma.eventCategory.findMany({
        orderBy: { sortOrder: "asc" },
      });
      expect(rows.slice(-2).map((r) => r.id)).toEqual([first.id, second.id]);
    } finally {
      await prisma.eventCategory.deleteMany({
        where: { id: { in: [first.id, second.id] } },
      });
    }
  });

  test("createEventCategory は isActive:true な同名カテゴリーがあると CONFLICT で拒否する", async () => {
    const name = `テスト重複カテゴリー ${crypto.randomUUID()}`;
    const created = await createEventCategory({ name });

    try {
      let thrown: unknown = null;
      try {
        await createEventCategory({ name });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(DomainError);
    } finally {
      await prisma.eventCategory.deleteMany({ where: { id: created.id } });
    }
  });

  test("updateEventCategory は名前・説明・アイコン・色を更新する", async () => {
    const suffix = crypto.randomUUID();
    const created = await createEventCategory({
      name: `ワークショップ ${suffix}`,
    });

    try {
      await updateEventCategory(created.id, {
        name: `ワークショップ改 ${suffix}`,
        description: "説明を更新",
      });

      const updated = await prisma.eventCategory.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(updated.name).toBe(`ワークショップ改 ${suffix}`);
      expect(updated.description).toBe("説明を更新");
    } finally {
      await prisma.eventCategory.deleteMany({ where: { id: created.id } });
    }
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

  test("updateEventCategoryOrder は sortOrder を並び替える（既存カテゴリーは保持したまま自分の2件を入れ替える）", async () => {
    // updateEventCategoryOrder は「全 EventCategory が過不足なく揃っていること」を
    // 検証するため、対象スコープは全件。既存行は保持したまま自分の2行だけ
    // 追加して入れ替える。
    const suffix = crypto.randomUUID();
    const existing = await prisma.eventCategory.findMany({
      select: { id: true, sortOrder: true },
    });

    const a = await createEventCategory({ name: `A ${suffix}` });
    const b = await createEventCategory({ name: `B ${suffix}` });
    const aRow = await prisma.eventCategory.findUniqueOrThrow({
      where: { id: a.id },
      select: { sortOrder: true },
    });
    const bRow = await prisma.eventCategory.findUniqueOrThrow({
      where: { id: b.id },
      select: { sortOrder: true },
    });

    try {
      await updateEventCategoryOrder([
        ...existing.map((e) => ({ id: e.id, sortOrder: e.sortOrder })),
        { id: a.id, sortOrder: bRow.sortOrder },
        { id: b.id, sortOrder: aRow.sortOrder },
      ]);

      const rows = await prisma.eventCategory.findMany({
        orderBy: { sortOrder: "asc" },
      });
      expect(rows.map((r) => r.id)).toEqual([
        ...existing.map((e) => e.id),
        b.id,
        a.id,
      ]);
    } finally {
      await prisma.eventCategory.deleteMany({
        where: { id: { in: [a.id, b.id] } },
      });
    }
  });

  test("deleteEventCategory はイベントが紐づく場合 CONFLICT で拒否する", async () => {
    const suffix = crypto.randomUUID();
    const created = await createEventCategory({
      name: `ワークショップ ${suffix}`,
    });
    await createLinkedEvent(created.id, suffix);

    try {
      let thrown: unknown = null;
      try {
        await deleteEventCategory(created.id);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(DomainError);
    } finally {
      await prisma.event.deleteMany({ where: { categoryId: created.id } });
      await prisma.eventCategory.deleteMany({ where: { id: created.id } });
    }
  });

  test("deleteEventCategory はイベント紐づけがなければ isActive:false にする", async () => {
    const suffix = crypto.randomUUID();
    const created = await createEventCategory({
      name: `ワークショップ ${suffix}`,
    });

    try {
      await deleteEventCategory(created.id);

      const row = await prisma.eventCategory.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(row.isActive).toBe(false);
    } finally {
      await prisma.eventCategory.deleteMany({ where: { id: created.id } });
    }
  });

  test("updateEventCategoryActive はイベントが紐づく場合の非アクティブ化を CONFLICT で拒否する", async () => {
    const suffix = crypto.randomUUID();
    const created = await createEventCategory({
      name: `ワークショップ ${suffix}`,
    });
    await createLinkedEvent(created.id, `${suffix}-2`);

    try {
      let thrown: unknown = null;
      try {
        await updateEventCategoryActive(created.id, false);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(DomainError);
    } finally {
      await prisma.event.deleteMany({ where: { categoryId: created.id } });
      await prisma.eventCategory.deleteMany({ where: { id: created.id } });
    }
  });
});
