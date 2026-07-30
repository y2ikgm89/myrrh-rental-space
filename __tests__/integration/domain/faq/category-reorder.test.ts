/**
 * faq/category-commands の reorderFaqCategories 実 DB 回帰テスト。
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
type CommandsModule = typeof import("@/shared/domain/faq/category-commands");

let prisma: PrismaModule["prisma"];
let reorderFaqCategories: CommandsModule["reorderFaqCategories"];

describeMaybe("faq/category-commands の reorder", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ reorderFaqCategories } =
      await import("@/shared/domain/faq/category-commands"));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("reorderFaqCategories は order を並び替える（既存カテゴリーは保持したまま自分の2件を入れ替える）", async () => {
    // reorderFaqCategories は「未削除 FaqCategory が過不足なく揃っていること」を
    // 検証するため、対象スコープは全件。FaqItem.categoryId は onDelete: Cascade
    // だが、deleteMany({}) は seed 済みの実 FAQ カテゴリー・質問を問答無用で破壊し
    // 以降の seed 実行を壊すため使わない。既存行は保持したまま自分の2行だけ
    // 追加して入れ替える。
    const suffix = crypto.randomUUID();
    const existing = await prisma.faqCategory.findMany({
      where: { deletedAt: null },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    // order は非削除行間の partial unique。過去の soft-delete で欠番が生じている
    // 可能性があるため existing.length ではなく既存最大値の次を使う
    // （0..N-1 への詰め直しは reorderFaqCategories 自体が行う）。
    const maxOrder = await prisma.faqCategory.aggregate({
      where: { deletedAt: null },
      _max: { order: true },
    });
    const baseOrder = (maxOrder._max.order ?? -1) + 1;

    const a = await prisma.faqCategory.create({
      data: {
        name: `Repro A ${suffix}`,
        slug: `repro-faq-category-a-${suffix}`,
        order: baseOrder,
      },
    });
    const b = await prisma.faqCategory.create({
      data: {
        name: `Repro B ${suffix}`,
        slug: `repro-faq-category-b-${suffix}`,
        order: baseOrder + 1,
      },
    });

    try {
      await reorderFaqCategories([...existing.map((e) => e.id), b.id, a.id]);

      const rows = await prisma.faqCategory.findMany({
        where: { deletedAt: null },
        orderBy: { order: "asc" },
      });
      expect(rows.map((r) => r.id)).toEqual([
        ...existing.map((e) => e.id),
        b.id,
        a.id,
      ]);
    } finally {
      await prisma.faqCategory.deleteMany({
        where: { id: { in: [a.id, b.id] } },
      });
    }
  });
});
