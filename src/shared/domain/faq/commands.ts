import "server-only";

import { parsePrismaInputJson } from "@/shared/db/json";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { stripHtmlToText } from "@/shared/lib/lexical/html-to-plain-text";
import { omitUndefined } from "@/shared/lib/serialize";
import type {
  BulkFaqItemResult,
  CreateFaqCategoryResult,
  CreateFaqItemResult,
  FaqCategoryCommandInput,
  FaqItemCommandInput,
  ToggleFaqItemPublishedResult,
} from "@/shared/domain/faq/types";

const ANSWER_PLAIN_TEXT_MAX_LENGTH = 200;

function parseAnswerJson(answerJson: string) {
  return parsePrismaInputJson(answerJson, "回答データが不正です");
}

function normalizeNullableString(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }
  return value;
}

async function ensureFaqCategoryExists(id: string): Promise<void> {
  const category = await prisma.faqCategory.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!category) {
    throw new DomainError("カテゴリが見つかりません", "NOT_FOUND");
  }
}

async function ensureFaqCategoryUnique(
  slug: string,
  currentId?: string,
): Promise<void> {
  const existing = await prisma.faqCategory.findFirst({
    where: omitUndefined({
      slug,
      deletedAt: null,
      id: currentId ? { not: currentId } : undefined,
    }),
    select: { id: true },
  });

  if (existing) {
    throw new DomainError("このスラッグは既に使用されています", "CONFLICT");
  }
}

async function ensureFaqItemExists(id: string): Promise<void> {
  const item = await prisma.faqItem.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!item) {
    throw new DomainError("質問が見つかりません", "NOT_FOUND");
  }
}

// ============================================================================
// FaqCategory: create / update / soft delete / reorder / restore / permanent delete
// ============================================================================

export async function createFaqCategory(
  input: FaqCategoryCommandInput,
): Promise<CreateFaqCategoryResult> {
  await ensureFaqCategoryUnique(input.slug);

  const maxOrder = await prisma.faqCategory.aggregate({
    where: { deletedAt: null },
    _max: { order: true },
  });

  const category = await prisma.faqCategory.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: normalizeNullableString(input.description),
      iconEmoji: normalizeNullableString(input.iconEmoji),
      order: input.order || (maxOrder._max.order ?? 0) + 1,
      isActive: input.isActive,
    },
    select: { id: true },
  });

  return category;
}

export async function updateFaqCategory(
  id: string,
  input: FaqCategoryCommandInput,
): Promise<void> {
  await Promise.all([
    ensureFaqCategoryExists(id),
    ensureFaqCategoryUnique(input.slug, id),
  ]);

  await prisma.faqCategory.update({
    where: { id, deletedAt: null },
    data: {
      name: input.name,
      slug: input.slug,
      description: normalizeNullableString(input.description),
      iconEmoji: normalizeNullableString(input.iconEmoji),
      order: input.order,
      isActive: input.isActive,
    },
  });
}

/**
 * カテゴリをソフトデリート。配下に未削除の質問が残っている場合は拒否。
 * gotchas.md §ソフトデリート 参照
 */
export async function deleteFaqCategory(id: string): Promise<void> {
  const category = await prisma.faqCategory.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      _count: {
        select: {
          items: {
            where: { deletedAt: null },
          },
        },
      },
    },
  });

  if (!category) {
    throw new DomainError("カテゴリが見つかりません", "NOT_FOUND");
  }

  if (category._count.items > 0) {
    throw new DomainError(
      "このカテゴリには質問が含まれています。先に質問を削除または移動してください",
      "CONFLICT",
    );
  }

  await prisma.faqCategory.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function restoreFaqCategory(id: string): Promise<void> {
  const category = await prisma.faqCategory.findUnique({
    where: { id },
    select: { id: true, deletedAt: true, slug: true },
  });

  if (!category) {
    throw new DomainError("カテゴリが見つかりません", "NOT_FOUND");
  }

  if (category.deletedAt === null) {
    throw new DomainError("このカテゴリは削除されていません", "CONFLICT");
  }

  // slug 競合チェック: 復元先に同一 slug のアクティブカテゴリが存在しないこと
  const conflict = await prisma.faqCategory.findFirst({
    where: { slug: category.slug, deletedAt: null, id: { not: id } },
    select: { id: true },
  });
  if (conflict) {
    throw new DomainError(
      "同じスラッグのアクティブなカテゴリが既に存在します",
      "CONFLICT",
    );
  }

  await prisma.faqCategory.update({
    where: { id },
    data: { deletedAt: null },
  });
}

export async function permanentlyDeleteFaqCategory(id: string): Promise<void> {
  const category = await prisma.faqCategory.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  });

  if (!category) {
    throw new DomainError("カテゴリが見つかりません", "NOT_FOUND");
  }

  if (category.deletedAt === null) {
    throw new DomainError(
      "先にソフトデリートしてから完全削除してください",
      "CONFLICT",
    );
  }

  // Cascade で配下 items も hard delete される（Prisma schema の onDelete: Cascade）
  await prisma.faqCategory.delete({
    where: { id },
  });
}

export async function reorderFaqCategories(
  orderedIds: string[],
): Promise<void> {
  if (orderedIds.length === 0) {
    return;
  }

  // Interactive transaction で pg deprecation 回避（gotchas.md §トランザクション）
  await prisma.$transaction(async (tx) => {
    for (const [index, id] of orderedIds.entries()) {
      await tx.faqCategory.update({
        where: { id, deletedAt: null },
        data: { order: index },
      });
    }
  });
}

// ============================================================================
// FaqItem: create / update / soft delete / reorder / toggle / restore / permanent
// ============================================================================

export async function createFaqItem(
  input: FaqItemCommandInput,
): Promise<CreateFaqItemResult> {
  await ensureFaqCategoryExists(input.categoryId);

  const maxOrder = await prisma.faqItem.aggregate({
    where: { categoryId: input.categoryId, deletedAt: null },
    _max: { order: true },
  });

  const item = await prisma.faqItem.create({
    data: {
      categoryId: input.categoryId,
      question: input.question,
      answerJson: parseAnswerJson(input.answerJson),
      answerHtml: input.answerHtml,
      answerPlainText: stripHtmlToText(
        input.answerHtml,
        ANSWER_PLAIN_TEXT_MAX_LENGTH,
      ),
      order: input.order || (maxOrder._max.order ?? 0) + 1,
      isPublished: input.isPublished,
      publishedAt: input.isPublished ? new Date() : null,
      metaDescription: normalizeNullableString(input.metaDescription),
      metaKeywords: normalizeNullableString(input.metaKeywords),
      ogpTitle: normalizeNullableString(input.ogpTitle),
      ogpDescription: normalizeNullableString(input.ogpDescription),
      ogpImageUrl: normalizeNullableString(input.ogpImageUrl),
    },
    select: { id: true },
  });

  return item;
}

export async function updateFaqItem(
  id: string,
  input: FaqItemCommandInput,
): Promise<void> {
  await Promise.all([
    ensureFaqItemExists(id),
    ensureFaqCategoryExists(input.categoryId),
  ]);

  await prisma.faqItem.update({
    where: { id, deletedAt: null },
    data: {
      categoryId: input.categoryId,
      question: input.question,
      answerJson: parseAnswerJson(input.answerJson),
      answerHtml: input.answerHtml,
      answerPlainText: stripHtmlToText(
        input.answerHtml,
        ANSWER_PLAIN_TEXT_MAX_LENGTH,
      ),
      order: input.order,
      isPublished: input.isPublished,
      publishedAt: input.isPublished ? new Date() : null,
      metaDescription: normalizeNullableString(input.metaDescription),
      metaKeywords: normalizeNullableString(input.metaKeywords),
      ogpTitle: normalizeNullableString(input.ogpTitle),
      ogpDescription: normalizeNullableString(input.ogpDescription),
      ogpImageUrl: normalizeNullableString(input.ogpImageUrl),
    },
  });
}

export async function deleteFaqItem(id: string): Promise<void> {
  await ensureFaqItemExists(id);

  await prisma.faqItem.update({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
}

export async function restoreFaqItem(id: string): Promise<void> {
  const item = await prisma.faqItem.findUnique({
    where: { id },
    select: {
      id: true,
      deletedAt: true,
      category: { select: { id: true, deletedAt: true } },
    },
  });

  if (!item) {
    throw new DomainError("質問が見つかりません", "NOT_FOUND");
  }

  if (item.deletedAt === null) {
    throw new DomainError("この質問は削除されていません", "CONFLICT");
  }

  if (item.category.deletedAt !== null) {
    throw new DomainError(
      "親カテゴリが削除されています。先にカテゴリを復元してください",
      "CONFLICT",
    );
  }

  await prisma.faqItem.update({
    where: { id },
    data: { deletedAt: null },
  });
}

export async function permanentlyDeleteFaqItem(id: string): Promise<void> {
  const item = await prisma.faqItem.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  });

  if (!item) {
    throw new DomainError("質問が見つかりません", "NOT_FOUND");
  }

  if (item.deletedAt === null) {
    throw new DomainError(
      "先にソフトデリートしてから完全削除してください",
      "CONFLICT",
    );
  }

  await prisma.faqItem.delete({
    where: { id },
  });
}

export async function reorderFaqItems(
  categoryId: string,
  orderedIds: string[],
): Promise<void> {
  await ensureFaqCategoryExists(categoryId);

  if (orderedIds.length === 0) {
    return;
  }

  // Interactive transaction で pg deprecation 回避
  await prisma.$transaction(async (tx) => {
    for (const [index, id] of orderedIds.entries()) {
      await tx.faqItem.update({
        where: { id, deletedAt: null },
        data: { order: index, categoryId },
      });
    }
  });
}

export async function toggleFaqItemPublished(
  id: string,
): Promise<ToggleFaqItemPublishedResult> {
  const item = await prisma.faqItem.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, isPublished: true },
  });

  if (!item) {
    throw new DomainError("質問が見つかりません", "NOT_FOUND");
  }

  const isPublished = !item.isPublished;

  await prisma.faqItem.update({
    where: { id, deletedAt: null },
    data: {
      isPublished,
      publishedAt: isPublished ? new Date() : null,
    },
  });

  return { isPublished };
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

  // 移動先カテゴリの現在の最大 order を取得し、新規項目を末尾に append
  const maxOrder = await prisma.faqItem.aggregate({
    where: { categoryId: newCategoryId, deletedAt: null },
    _max: { order: true },
  });
  const startOrder = (maxOrder._max.order ?? 0) + 1;

  // Interactive transaction で 1 件ずつ order 更新
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

// ============================================================================
// Analytics: viewCount increment
// ============================================================================

/**
 * FAQ 項目の viewCount をアトミックに increment
 * 公開中かつ未削除の項目のみ対象。存在しない ID は silent skip（spam 防止）。
 * Zendesk / HubSpot KB 方式: 集計値のみ、個人データは保存しない。
 */
export async function incrementFaqItemViewCount(
  id: string,
): Promise<{ incremented: boolean }> {
  const result = await prisma.faqItem.updateMany({
    where: { id, isPublished: true, deletedAt: null },
    data: {
      viewCount: { increment: 1 },
      lastViewedAt: new Date(),
    },
  });
  return { incremented: result.count > 0 };
}

/**
 * 長期間更新されていない公開中 FAQ 項目（stale）を検出
 * 閾値日数以上 updatedAt が古い項目を新しい順に返す。
 */
export async function detectStaleFaqItems(
  staleDays: number,
  limit = 20,
): Promise<ReadonlyArray<{ id: string; question: string; updatedAt: Date }>> {
  if (staleDays < 1) {
    throw new DomainError(
      "staleDays は 1 以上でなければなりません",
      "VALIDATION",
    );
  }
  const threshold = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

  return prisma.faqItem.findMany({
    where: {
      isPublished: true,
      deletedAt: null,
      updatedAt: { lt: threshold },
    },
    select: { id: true, question: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
}

/**
 * FAQ 項目の helpful 投票をアトミックに increment
 * 公開中かつ未削除の項目のみ対象。存在しない ID は silent skip。
 */
export async function voteFaqItemHelpful(
  id: string,
  vote: "helpful" | "not-helpful",
): Promise<{ voted: boolean }> {
  const result = await prisma.faqItem.updateMany({
    where: { id, isPublished: true, deletedAt: null },
    data:
      vote === "helpful"
        ? { helpfulCount: { increment: 1 } }
        : { notHelpfulCount: { increment: 1 } },
  });
  return { voted: result.count > 0 };
}

// ============================================================================
// Cron cleanup: 30 日経過したソフトデリート済み項目を完全削除
// ============================================================================

/**
 * Recycle bin 自動パージ
 * `deletedAt` が指定日数以前のソフトデリート済みカテゴリ・質問を完全削除する。
 * Cascade で親カテゴリ配下の質問も削除される。
 * idempotent（再実行しても副作用なし）。
 */
export async function permanentlyDeleteExpiredFaqTrash(
  retentionDays: number,
): Promise<{ categoriesDeleted: number; itemsDeleted: number }> {
  if (retentionDays < 0) {
    throw new DomainError(
      "retentionDays は 0 以上でなければなりません",
      "VALIDATION",
    );
  }

  const threshold = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  // 先に孤児アイテム（親が生きていても item 自体が古い deletedAt）を削除
  // ※ 親カテゴリが同時に期限切れなら Cascade で削除されるが、
  //   親が復元されたまま子だけ期限切れのケースは手動削除が必要
  const itemsResult = await prisma.faqItem.deleteMany({
    where: {
      deletedAt: { not: null, lt: threshold },
    },
  });

  // 次にカテゴリを削除（Cascade で配下 item も削除）
  const categoriesResult = await prisma.faqCategory.deleteMany({
    where: {
      deletedAt: { not: null, lt: threshold },
    },
  });

  return {
    categoriesDeleted: categoriesResult.count,
    itemsDeleted: itemsResult.count,
  };
}
