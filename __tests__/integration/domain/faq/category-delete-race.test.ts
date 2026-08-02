/**
 * FAQ カテゴリ削除の check-then-act レース防止（advisory lock 直列化）の統合テスト（実 DB 必須）。
 *
 * deleteFaqCategory は「アクティブ項目数の確認」→「deletedAt 書込」を、
 * createFaqItem / updateFaqItem（カテゴリ移動）/ restoreFaqItem と共有する
 * `faq_items:${categoryId}` advisory lock（src/shared/domain/order-sql.ts の
 * `buildOrderScopeLockSql`、`pg_advisory_xact_lock(728351, hashtext(scope))`）で
 * 直列化している。lock 未使用時は、カテゴリの「配下アクティブ項目 0 件」チェックと
 * 削除確定が別々の非トランザクション文のため、その間に別セッションが同カテゴリへ
 * アクティブ項目を追加（createFaqItem）または復元（restoreFaqItem）すると、
 * 非公開カテゴリの下にアクティブな FaqItem が孤児化する（公開クエリ・ゴミ箱
 * どちらにも現れず、後でカテゴリを完全削除すると Cascade で無警告のままハード
 * 削除される）。
 *
 * 既存の commands.test.ts の同等テストは Prisma を丸ごと mock しており、
 * 「advisory lock の SQL 文字列が $executeRaw に渡された」ことしか検証できない。
 * 本テストは実 Postgres 上で deleteFaqCategory と createFaqItem / restoreFaqItem を
 * 同時に投げ、「カテゴリが削除されているのに配下にアクティブ項目が存在する」状態が
 * 発生しないことを検証する（space-overlap-concurrency.test.ts と同型）。
 *
 * == 実行条件 ==
 * 実 Postgres を要求する（advisory lock の直列化挙動は mock では再現不能）。
 * `bun run test:integration` は docker-compose の test-db 既定値を注入する。直接
 * `bun test` でこのファイルを実行し `TEST_DATABASE_URL` が未設定の場合のみ
 * describe ごと skip する（dev DB を誤って汚染しないための安全弁）。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

// グローバル preload (__tests__/setup.ts) は DATABASE_URL をダミー値に固定する。
// gateway を読む前に実テスト DB へ向け直す（静的 import は gateway を引かないため、
// この代入は動的 import より先に実行される）。
const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type CategoryCommandsModule =
  typeof import("@/shared/domain/faq/category-commands");
type ItemCommandsModule = typeof import("@/shared/domain/faq/item-commands");
type DomainErrorModule = typeof import("@/shared/domain/domain-error");

let prisma: PrismaModule["prisma"];
let deleteFaqCategory: CategoryCommandsModule["deleteFaqCategory"];
let createFaqItem: ItemCommandsModule["createFaqItem"];
let restoreFaqItem: ItemCommandsModule["restoreFaqItem"];
let DomainError: DomainErrorModule["DomainError"];

let nextFixtureOrder = 1_400_000_000;

type CategoryFixture = {
  categoryId: string;
  cleanup: () => Promise<void>;
};

/** アクティブ項目 0 件の FaqCategory を 1 件作る最小 fixture。 */
async function createCategoryFixture(): Promise<CategoryFixture> {
  const suffix = crypto.randomUUID();

  const category = await prisma.faqCategory.create({
    data: {
      name: `race-cat-${suffix}`,
      slug: `race-cat-${suffix}`,
      order: nextFixtureOrder++,
      isActive: true,
    },
    select: { id: true },
  });

  return {
    categoryId: category.id,
    cleanup: async () => {
      await prisma.faqItem.deleteMany({ where: { categoryId: category.id } });
      await prisma.faqCategory.deleteMany({ where: { id: category.id } });
    },
  };
}

const CONCURRENCY = 8;

describeMaybe(
  "deleteFaqCategory — アクティブ項目チェックと削除の check-then-act レース防止",
  () => {
    beforeAll(async () => {
      ({ prisma } = await import("@/shared/db/prisma"));
      ({ deleteFaqCategory } =
        await import("@/shared/domain/faq/category-commands"));
      ({ createFaqItem, restoreFaqItem } =
        await import("@/shared/domain/faq/item-commands"));
      ({ DomainError } = await import("@/shared/domain/domain-error"));
      // 接続プールをウォームアップ（コールドスタートが並行クエリをずらして race を隠すのを防ぐ）。
      await prisma.$queryRaw`SELECT 1`;
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    // 競合テストは直列化を見るもので、**この環境では削除が常に競合に負ける**ため
    // 「削除が勝った」分岐が一度も走らない（CONFLICT ガードを外して 5 回実行しても
    // 全て緑だった）。ガードそのものはスケジューリングに依存しない形で検査する。
    test("アクティブ項目があるカテゴリの削除は CONFLICT で拒否される", async () => {
      const { categoryId, cleanup } = await createCategoryFixture();

      try {
        await createFaqItem({
          categoryId,
          question: `ガード検査 質問 ${crypto.randomUUID()}`,
          answer: "回答",
          isPublished: false,
        });

        let thrown: unknown = null;
        try {
          await deleteFaqCategory(categoryId);
        } catch (error) {
          thrown = error;
        }

        expect(thrown).toBeInstanceOf(DomainError);
        expect(
          (thrown as InstanceType<DomainErrorModule["DomainError"]>).code,
        ).toBe("CONFLICT");

        const category = await prisma.faqCategory.findUnique({
          where: { id: categoryId },
          select: { deletedAt: true },
        });
        expect(category?.deletedAt).toBeNull();
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("アクティブ項目が無いカテゴリは削除できる", async () => {
      const { categoryId, cleanup } = await createCategoryFixture();

      try {
        await deleteFaqCategory(categoryId);

        const category = await prisma.faqCategory.findUnique({
          where: { id: categoryId },
          select: { deletedAt: true },
        });
        expect(category?.deletedAt).not.toBeNull();
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("delete と createFaqItem を同時に投げても非公開カテゴリ配下にアクティブ項目が残らない", async () => {
      const { categoryId, cleanup } = await createCategoryFixture();

      try {
        const [deleteOutcome] = await Promise.allSettled([
          deleteFaqCategory(categoryId),
          ...Array.from({ length: CONCURRENCY }, (_unused, index) =>
            createFaqItem({
              categoryId,
              question: `並行作成 質問 ${String(index)}`,
              answer: "回答",
              isPublished: false,
            }),
          ),
        ]);

        const category = await prisma.faqCategory.findUnique({
          where: { id: categoryId },
          select: { deletedAt: true },
        });
        const activeItemCount = await prisma.faqItem.count({
          where: { categoryId, deletedAt: null },
        });

        // 核心の不変条件：**削除済みカテゴリの配下にアクティブ項目は残らない**。
        //
        // 勝者は固定しない。`deleteFaqCategory` は advisory lock 内で
        // `_count.items > 0` なら CONFLICT を投げるので、項目操作が先にロックを
        // 取れば削除が失敗するのが正しい直列化であり、そこを `deletedAt` 必須に
        // すると**正しい挙動がスケジューリング次第で落ちる**。
        //
        // 一方で DB の状態だけで分岐すると、削除が壊れていても「負けたのだろう」と
        // 読めてしまい何も検出しない（実測: 削除を no-op にしても CONFLICT ガードを
        // 外しても緑のままだった）。**削除コマンド自身の結果**で分岐して、
        // その結果と DB 状態の整合を両分岐で検査する。
        expect(category).toBeDefined();

        if (deleteOutcome?.status === "fulfilled") {
          // 削除が勝った: 実際に削除済みで、配下は空。
          expect(category?.deletedAt).not.toBeNull();
          expect(activeItemCount).toBe(0);
        } else {
          // 項目操作が勝った: 削除は CONFLICT で拒否され、カテゴリは生きていて
          // 項目も残る。
          expect(category?.deletedAt).toBeNull();
          expect(activeItemCount).toBeGreaterThan(0);
        }
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("delete と restoreFaqItem を同時に投げても非公開カテゴリ配下にアクティブ項目が残らない", async () => {
      const { categoryId, cleanup } = await createCategoryFixture();

      try {
        // 復元対象として、事前にソフトデリート済みの項目を 1 件用意する。
        const { id: itemId } = await createFaqItem({
          categoryId,
          question: "復元対象の質問",
          answer: "回答",
          isPublished: false,
        });
        await prisma.faqItem.update({
          where: { id: itemId },
          data: { deletedAt: new Date() },
        });

        const [deleteOutcome] = await Promise.allSettled([
          deleteFaqCategory(categoryId),
          restoreFaqItem(itemId),
        ]);

        const category = await prisma.faqCategory.findUnique({
          where: { id: categoryId },
          select: { deletedAt: true },
        });
        const activeItemCount = await prisma.faqItem.count({
          where: { categoryId, deletedAt: null },
        });

        // 核心の不変条件：**削除済みカテゴリの配下にアクティブ項目は残らない**。
        //
        // 勝者は固定しない。`deleteFaqCategory` は advisory lock 内で
        // `_count.items > 0` なら CONFLICT を投げるので、項目操作が先にロックを
        // 取れば削除が失敗するのが正しい直列化であり、そこを `deletedAt` 必須に
        // すると**正しい挙動がスケジューリング次第で落ちる**。
        //
        // 一方で DB の状態だけで分岐すると、削除が壊れていても「負けたのだろう」と
        // 読めてしまい何も検出しない（実測: 削除を no-op にしても CONFLICT ガードを
        // 外しても緑のままだった）。**削除コマンド自身の結果**で分岐して、
        // その結果と DB 状態の整合を両分岐で検査する。
        expect(category).toBeDefined();

        if (deleteOutcome?.status === "fulfilled") {
          // 削除が勝った: 実際に削除済みで、配下は空。
          expect(category?.deletedAt).not.toBeNull();
          expect(activeItemCount).toBe(0);
        } else {
          // 項目操作が勝った: 削除は CONFLICT で拒否され、カテゴリは生きていて
          // 項目も残る。
          expect(category?.deletedAt).toBeNull();
          expect(activeItemCount).toBeGreaterThan(0);
        }
      } finally {
        await cleanup();
      }
    }, 30_000);
  },
);
