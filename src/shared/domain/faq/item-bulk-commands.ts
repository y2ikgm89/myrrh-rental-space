import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
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
 */
export async function bulkPublishFaqItems(
  ids: string[],
  isPublished: boolean,
): Promise<BulkFaqItemResult> {
  if (ids.length === 0) return { count: 0 };

  const now = new Date();
  const result = await prisma.faqItem.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data: {
      isPublished,
      publishedAt: isPublished ? now : null,
    },
  });

  return { count: result.count };
}

/**
 * 複数の FAQ 項目を一括ソフトデリート
 */
export async function bulkDeleteFaqItems(
  ids: string[],
): Promise<BulkFaqItemResult> {
  if (ids.length === 0) return { count: 0 };

  const now = new Date();
  const result = await prisma.faqItem.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data: { deletedAt: now },
  });

  return { count: result.count };
}

/**
 * 複数の FAQ 項目を別カテゴリへ一括移動
 * 移動先に既存項目がある場合、新アイテムは末尾に append される
 */
export async function bulkMoveFaqItems(
  ids: string[],
  newCategoryId: string,
): Promise<BulkFaqItemResult> {
  if (ids.length === 0) return { count: 0 };

  await ensureFaqCategoryExists(newCategoryId);

  const maxOrder = await prisma.faqItem.aggregate({
    where: { categoryId: newCategoryId, deletedAt: null },
    _max: { order: true },
  });
  const startOrder = (maxOrder._max.order ?? 0) + 1;

  const movedCount = await prisma.$transaction(async (tx) => {
    let count = 0;
    let order = startOrder;
    for (const id of ids) {
      const result = await tx.faqItem.updateMany({
        where: { id, deletedAt: null },
        data: { categoryId: newCategoryId, order },
      });
      if (result.count > 0) {
        count += result.count;
        order += 1;
      }
    }
    return count;
  });

  return { count: movedCount };
}
