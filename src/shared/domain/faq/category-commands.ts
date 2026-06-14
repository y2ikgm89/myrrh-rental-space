import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { omitUndefined } from "@/shared/lib/serialize";
import type {
  CreateFaqCategoryResult,
  FaqCategoryCommandInput,
} from "@/shared/domain/faq/types";

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
      icon: normalizeNullableString(input.icon),
      // 並び順は末尾に自動採番。手動指定は廃止（並び替えは D&D の reorderFaqCategories が SSoT）
      order: (maxOrder._max.order ?? 0) + 1,
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

  // order は更新対象外。位置は D&D の reorderFaqCategories のみが変更する
  await prisma.faqCategory.update({
    where: { id, deletedAt: null },
    data: {
      name: input.name,
      slug: input.slug,
      description: normalizeNullableString(input.description),
      icon: normalizeNullableString(input.icon),
      isActive: input.isActive,
    },
  });
}

/**
 * カテゴリをソフトデリート。配下に未削除の質問が残っている場合は拒否。
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

  // Interactive transaction で pg deprecation 回避
  await prisma.$transaction(async (tx) => {
    for (const [index, id] of orderedIds.entries()) {
      await tx.faqCategory.update({
        where: { id, deletedAt: null },
        data: { order: index },
      });
    }
  });
}
