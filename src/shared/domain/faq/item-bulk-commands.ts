import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { buildOrderScopeLockSql } from "@/shared/domain/order-sql";
import type { BulkFaqItemResult } from "@/shared/domain/faq/types";

async function ensureFaqCategoryExists(id: string): Promise<void> {
  const category = await prisma.faqCategory.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!category) {
    throw new DomainError("カテゴリが見つかりません", "NOT_FOUND");
  }
}

// ============================================================================
// Bulk operations
// ============================================================================

/**
 * 複数の FAQ 項目を一括公開/非公開
 *
 * Round-5 audit Finding #16: 旧実装は affectedIds を返さず、呼び出し元の
 * Server Action は per-id audit を発行できなかった（coupon/customer/space の
 * bulk 系は Cluster A / Cluster P で対応済み）。対象を先に読んで id を確定
 * してから updateMany する（coupon の bulkToggleActiveCouponsCommand と同型）。
 *
 * findMany（対象確定）と updateMany（書込）の間には TOCTOU の window があるため、
 * updateMany の where にも deletedAt: null を再チェックする（bulkMoveFaqItems・
 * item-commands.ts の deleteFaqItem/updateFaqItemPublished と同じ claim pattern）。
 * これがないと、その間に別操作で削除された項目を誤って公開/非公開状態のまま
 * 復活させてしまう。
 */
export async function bulkPublishFaqItems(
  ids: string[],
  isPublished: boolean,
): Promise<BulkFaqItemResult> {
  if (ids.length === 0) return { count: 0, affectedIds: [] };

  const targets = await prisma.faqItem.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true },
  });
  if (targets.length === 0) return { count: 0, affectedIds: [] };

  const now = new Date();
  const affectedIds = targets.map((t) => t.id);
  const result = await prisma.faqItem.updateMany({
    where: { id: { in: affectedIds }, deletedAt: null },
    data: {
      isPublished,
      publishedAt: isPublished ? now : null,
    },
  });

  return { count: result.count, affectedIds };
}

/**
 * 複数の FAQ 項目を一括ソフトデリート
 *
 * findMany と updateMany の間の TOCTOU を防ぐため、updateMany の where にも
 * deletedAt: null を再チェックする（claim pattern。bulkPublishFaqItems 参照）。
 */
export async function bulkDeleteFaqItems(
  ids: string[],
): Promise<BulkFaqItemResult> {
  if (ids.length === 0) return { count: 0, affectedIds: [] };

  const targets = await prisma.faqItem.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true },
  });
  if (targets.length === 0) return { count: 0, affectedIds: [] };

  const now = new Date();
  const affectedIds = targets.map((t) => t.id);
  const result = await prisma.faqItem.updateMany({
    where: { id: { in: affectedIds }, deletedAt: null },
    data: { deletedAt: now },
  });

  return { count: result.count, affectedIds };
}

/**
 * 複数の FAQ 項目を別カテゴリへ一括移動
 * 移動先に既存項目がある場合、新アイテムは末尾に append される
 */
export async function bulkMoveFaqItems(
  ids: string[],
  newCategoryId: string,
): Promise<BulkFaqItemResult> {
  if (ids.length === 0) return { count: 0, affectedIds: [] };

  const affectedIds = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql(`faq_items:${newCategoryId}`));

    // createFaqItem / updateFaqItem / restoreFaqItem と同じ理由で、移動先
    // カテゴリの存在チェックは lock 取得後に行う（deleteFaqCategory との
    // レースを防ぐ。lock 取得前の事前チェックだと、チェック後・lock 取得前に
    // カテゴリが削除される check-then-act の窓が残る）。
    await ensureFaqCategoryExists(newCategoryId);

    const maxOrder = await tx.faqItem.aggregate({
      where: { categoryId: newCategoryId, deletedAt: null },
      _max: { order: true },
    });
    const startOrder = (maxOrder._max.order ?? -1) + 1;

    const moved: string[] = [];
    let order = startOrder;
    for (const id of ids) {
      const result = await tx.faqItem.updateMany({
        where: { id, deletedAt: null },
        data: { categoryId: newCategoryId, order },
      });
      if (result.count > 0) {
        moved.push(id);
        order += 1;
      }
    }
    return moved;
  });

  return { count: affectedIds.length, affectedIds };
}
