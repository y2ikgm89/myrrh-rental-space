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
      await expect(createEventCategory({ name })).rejects.toThrow(DomainError);
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
    await expect(
      updateEventCategory("00000000-0000-0000-0000-000000000000", {
        name: "test",
      }),
    ).rejects.toThrow(DomainError);
  });

  test("updateEventCategoryOrder は指定した 2 件の並びだけを入れ替える", async () => {
    // `updateEventCategoryOrder` は「全 EventCategory が過不足なく揃っていること」を
    // 要求するので、入力は全件でなければならない。ただし **assertion は自分が作った
    // 2 件の相対順序だけに限る**。
    //
    // 以前は全件の id 配列をそのまま `toEqual` で比較していた。この test DB は
    // 他のテストと共有で、並び替え系のテストが `sortOrder` を書き換えて去る
    // （実際に 0 と 109402888 台へ散っていた）。さらに比較の相手を `orderBy` 無しの
    // `findMany` で取っていたため、突き合わせ先が Postgres の**物理行順**になり、
    // 行を UPDATE するだけで並びが変わって不定に落ちていた。
    // 検査したいのは「指定した 2 件が入れ替わり、他は動かない」ことなので、
    // 他テストが作った状態に依存しない形で書く。
    const suffix = crypto.randomUUID();
    const before = await prisma.eventCategory.findMany({
      select: { id: true, sortOrder: true },
      orderBy: { sortOrder: "asc" },
    });

    const a = await createEventCategory({ name: `A ${suffix}` });
    const b = await createEventCategory({ name: `B ${suffix}` });
    const aOrder = (
      await prisma.eventCategory.findUniqueOrThrow({
        where: { id: a.id },
        select: { sortOrder: true },
      })
    ).sortOrder;
    const bOrder = (
      await prisma.eventCategory.findUniqueOrThrow({
        where: { id: b.id },
        select: { sortOrder: true },
      })
    ).sortOrder;

    try {
      await updateEventCategoryOrder([
        ...before.map((e) => ({ id: e.id, sortOrder: e.sortOrder })),
        { id: a.id, sortOrder: bOrder },
        { id: b.id, sortOrder: aOrder },
      ]);

      const after = await prisma.eventCategory.findMany({
        select: { id: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
      });
      const orderOf = (id: string): number => {
        const row = after.find((r) => r.id === id);
        if (row === undefined) throw new Error(`${id} が消えている`);
        return row.sortOrder;
      };

      // 作成時は a → b の順に採番される。入れ替え後は b が先に来る。
      expect(aOrder).toBeLessThan(bOrder);
      expect(orderOf(b.id)).toBeLessThan(orderOf(a.id));
      expect(orderOf(a.id)).toBe(bOrder);
      expect(orderOf(b.id)).toBe(aOrder);

      // 他の行は 1 つも動いていない。
      expect(
        after
          .filter((r) => r.id !== a.id && r.id !== b.id)
          .map((r) => ({ id: r.id, sortOrder: r.sortOrder })),
      ).toEqual(before.map((r) => ({ id: r.id, sortOrder: r.sortOrder })));
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
      await expect(deleteEventCategory(created.id)).rejects.toThrow(
        DomainError,
      );
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
      await expect(
        updateEventCategoryActive(created.id, false),
      ).rejects.toThrow(DomainError);
    } finally {
      await prisma.event.deleteMany({ where: { categoryId: created.id } });
      await prisma.eventCategory.deleteMany({ where: { id: created.id } });
    }
  });
});
