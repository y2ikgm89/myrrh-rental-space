/**
 * faq/item-commands の reorderFaqItems 実 DB 回帰テスト。
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

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type CommandsModule = typeof import("@/shared/domain/faq/item-commands");

let prisma: PrismaModule["prisma"];
let reorderFaqItems: CommandsModule["reorderFaqItems"];

describeMaybe("faq/item-commands の reorder", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ reorderFaqItems } = await import("@/shared/domain/faq/item-commands"));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("reorderFaqItems は order を並び替える", async () => {
    // reorderFaqItems は categoryId スコープの全件一致を検証するため、自分専用の
    // カテゴリーを作って隔離する（テーブル全体の deleteMany は seed 済みの実
    // FAQ を破壊するため使わない）。カテゴリーごと削除すれば質問も Cascade で消える。
    // FaqCategory.order は非削除行間で単独の partial unique index を持つため、
    // 既定値 0 は seed 済みの先頭カテゴリーと衝突しうる。既存最大値の次を使う。
    const suffix = crypto.randomUUID();
    const maxOrder = await prisma.faqCategory.aggregate({
      where: { deletedAt: null },
      _max: { order: true },
    });
    const category = await prisma.faqCategory.create({
      data: {
        name: `Repro Category ${suffix}`,
        slug: `repro-faq-item-category-${suffix}`,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });

    try {
      const a = await prisma.faqItem.create({
        data: {
          categoryId: category.id,
          question: "質問A",
          answer: "回答A",
          order: 0,
        },
      });
      const b = await prisma.faqItem.create({
        data: {
          categoryId: category.id,
          question: "質問B",
          answer: "回答B",
          order: 1,
        },
      });

      await reorderFaqItems(category.id, [
        { id: a.id, order: 1 },
        { id: b.id, order: 0 },
      ]);

      const rows = await prisma.faqItem.findMany({
        where: { categoryId: category.id },
        orderBy: { order: "asc" },
      });
      expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
    } finally {
      await prisma.faqCategory.deleteMany({ where: { id: category.id } });
    }
  });
});
