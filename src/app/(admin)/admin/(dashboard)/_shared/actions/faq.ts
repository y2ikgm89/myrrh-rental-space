"use server";

import { prisma } from "@/shared/lib/prisma";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import {
  createSuccess,
  createFailure,
  type ActionResult,
} from "@/admin/types/server-actions";
import { createValidationError } from "@/shared/lib/action-helpers";
import { withPermission } from "@/admin/lib/server-action-helpers";
import { checkReadPermissionFor } from "@/admin/lib/permissions";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import { purgeFaqCache } from "@/shared/lib/cloudflare";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import {
  faqCategoryFormSchema,
  faqItemFormSchema,
  type FaqCategoryFormInput,
  type FaqItemFormInput,
  type FaqCategoryWithItems,
  type FaqItemWithCategory,
} from "@/admin/lib/validations/faq";
import { toPlainObject, toPlainArray } from "@/shared/lib/serialize";

// =============================================================================
// Types
// =============================================================================

export type FaqCategoryListResult = {
  categories: FaqCategoryWithItems[];
  total: number;
};

export type FaqItemListResult = {
  items: FaqItemWithCategory[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type FaqItemFilters = {
  categoryId?: string;
  search?: string;
  isPublished?: boolean;
};

export type FaqItemPagination = {
  page?: number;
  limit?: number;
};

// =============================================================================
// Helper Functions
// =============================================================================

const checkReadPermission = checkReadPermissionFor("faq");

// =============================================================================
// FaqCategory Read Actions
// =============================================================================

/**
 * FAQカテゴリ一覧を取得（アイテム含む）
 */
export async function getFaqCategories(): Promise<FaqCategoryListResult> {
  if (!(await checkReadPermission())) {
    return { categories: [], total: 0 };
  }

  const categories = await prisma.faqCategory.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      order: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      items: {
        where: { isPublished: true },
        select: {
          id: true,
          categoryId: true,
          question: true,
          answerHtml: true,
          answerJson: true,
          order: true,
          isPublished: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
          metaDescription: true,
          metaKeywords: true,
          ogpTitle: true,
          ogpDescription: true,
          ogpImageUrl: true,
        },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { order: "asc" },
  });

  return {
    categories: toPlainArray(categories),
    total: categories.length,
  };
}

/**
 * FAQカテゴリ詳細を取得
 */
export async function getFaqCategoryById(
  id: string,
): Promise<FaqCategoryWithItems | null> {
  if (!(await checkReadPermission())) {
    return null;
  }

  return toPlainObject(
    await prisma.faqCategory.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { order: "asc" },
        },
      },
    }),
  );
}

// =============================================================================
// FaqCategory Write Actions (withPermission - 監査ログ自動記録)
// =============================================================================

/**
 * FAQカテゴリを作成
 */
export const createFaqCategory = withPermission<
  [data: FaqCategoryFormInput],
  { id: string }
>(
  "faq",
  "create",
)(async (user, data): Promise<ActionResult<{ id: string }>> => {
  const parsed = faqCategoryFormSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  // スラッグの重複チェック
  const existing = await prisma.faqCategory.findUnique({
    where: { slug: parsed.data.slug },
    select: { id: true },
  });

  if (existing) {
    return createFailure("このスラッグは既に使用されています");
  }

  // 最大orderを取得
  const maxOrder = await prisma.faqCategory.aggregate({
    _max: { order: true },
  });

  const category = await prisma.faqCategory.create({
    data: {
      ...parsed.data,
      order: parsed.data.order || (maxOrder._max.order ?? 0) + 1,
    },
  });

  updateTag(CACHE_TAGS.FAQ);

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgeFaqCache(), {
    operation: "purgeFaqCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });

  return createSuccess("カテゴリを作成しました", { id: category.id });
});

/**
 * FAQカテゴリを更新
 */
export const updateFaqCategory = withPermission<
  [id: string, data: FaqCategoryFormInput],
  void
>(
  "faq",
  "update",
)(async (user, id, data): Promise<ActionResult<void>> => {
  const parsed = faqCategoryFormSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  const existing = await prisma.faqCategory.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    return createFailure("カテゴリが見つかりません");
  }

  // スラッグの重複チェック（自分以外）
  const slugExists = await prisma.faqCategory.findFirst({
    where: {
      slug: parsed.data.slug,
      id: { not: id },
    },
    select: { id: true },
  });

  if (slugExists) {
    return createFailure("このスラッグは既に使用されています");
  }

  await prisma.faqCategory.update({
    where: { id },
    data: parsed.data,
  });

  updateTag(CACHE_TAGS.FAQ);

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgeFaqCache(), {
    operation: "purgeFaqCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });

  return createSuccess("カテゴリを更新しました");
});

/**
 * FAQカテゴリを削除
 */
export const deleteFaqCategory = withPermission<[id: string], void>(
  "faq",
  "delete",
)(async (user, id): Promise<ActionResult<void>> => {
  const category = await prisma.faqCategory.findUnique({
    where: { id },
    include: { _count: { select: { items: true } } },
  });

  if (!category) {
    return createFailure("カテゴリが見つかりません");
  }

  if (category._count.items > 0) {
    return createFailure(
      "このカテゴリには質問が含まれています。先に質問を削除または移動してください",
    );
  }

  await prisma.faqCategory.delete({
    where: { id },
  });

  updateTag(CACHE_TAGS.FAQ);

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgeFaqCache(), {
    operation: "purgeFaqCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });

  return createSuccess("カテゴリを削除しました");
});

/**
 * FAQカテゴリの順序を更新
 */
export const reorderFaqCategories = withPermission<
  [orderedIds: string[]],
  void
>(
  "faq",
  "update",
)(async (user, orderedIds): Promise<ActionResult<void>> => {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.faqCategory.update({
        where: { id },
        data: { order: index },
      }),
    ),
  );

  updateTag(CACHE_TAGS.FAQ);

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgeFaqCache(), {
    operation: "purgeFaqCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });

  return createSuccess("順序を更新しました");
});

// =============================================================================
// FaqItem Read Actions
// =============================================================================

/**
 * FAQ項目一覧を取得
 */
export async function getFaqItems(
  filters: FaqItemFilters = {},
  pagination: FaqItemPagination = {},
): Promise<FaqItemListResult> {
  if (!(await checkReadPermission())) {
    return { items: [], total: 0, page: 1, limit: 20, totalPages: 0 };
  }

  const { categoryId, search, isPublished } = filters;
  const { page = 1, limit = 20 } = pagination;

  type WhereInput = {
    categoryId?: string;
    isPublished?: boolean;
    OR?: Array<{
      question?: { contains: string; mode: "insensitive" };
      answerHtml?: { contains: string; mode: "insensitive" };
    }>;
  };

  const where: WhereInput = {};

  if (categoryId) {
    where.categoryId = categoryId;
  }

  if (typeof isPublished === "boolean") {
    where.isPublished = isPublished;
  }

  if (search) {
    where.OR = [
      { question: { contains: search, mode: "insensitive" } },
      { answerHtml: { contains: search, mode: "insensitive" } },
    ];
  }

  // 総件数と項目一覧を並列取得（N+1解消）
  const [total, items] = await prisma.$transaction([
    prisma.faqItem.count({ where }),
    prisma.faqItem.findMany({
      where,
      select: {
        id: true,
        categoryId: true,
        question: true,
        answerHtml: true,
        answerJson: true,
        order: true,
        isPublished: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        metaDescription: true,
        metaKeywords: true,
        ogpTitle: true,
        ogpDescription: true,
        ogpImageUrl: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: [{ category: { order: "asc" } }, { order: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    items: toPlainArray(items),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * FAQ項目詳細を取得
 */
export async function getFaqItemById(
  id: string,
): Promise<FaqItemWithCategory | null> {
  if (!(await checkReadPermission())) {
    return null;
  }

  return toPlainObject(
    await prisma.faqItem.findUnique({
      where: { id },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    }),
  );
}

// =============================================================================
// FaqItem Write Actions (withPermission - 監査ログ自動記録)
// =============================================================================

/**
 * FAQ項目を作成
 */
export const createFaqItem = withPermission<
  [data: FaqItemFormInput],
  { id: string }
>(
  "faq",
  "create",
)(async (user, data): Promise<ActionResult<{ id: string }>> => {
  const parsed = faqItemFormSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  // カテゴリの存在確認
  const category = await prisma.faqCategory.findUnique({
    where: { id: parsed.data.categoryId },
    select: { id: true },
  });

  if (!category) {
    return createFailure("カテゴリが見つかりません");
  }

  // カテゴリ内の最大orderを取得
  const maxOrder = await prisma.faqItem.aggregate({
    where: { categoryId: parsed.data.categoryId },
    _max: { order: true },
  });

  // JSON → HTML 変換
  const { answerJson, ...rest } = parsed.data;
  const answerHtml = await renderEditorStateToHtmlLazy(answerJson);

  const item = await prisma.faqItem.create({
    data: {
      ...rest,
      answerJson: JSON.parse(answerJson),
      answerHtml,
      order: parsed.data.order || (maxOrder._max.order ?? 0) + 1,
    },
  });

  updateTag(CACHE_TAGS.FAQ);

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgeFaqCache(), {
    operation: "purgeFaqCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });

  return createSuccess("質問を作成しました", { id: item.id });
});

/**
 * FAQ項目を更新
 */
export const updateFaqItem = withPermission<
  [id: string, data: FaqItemFormInput],
  void
>(
  "faq",
  "update",
)(async (user, id, data): Promise<ActionResult<void>> => {
  const parsed = faqItemFormSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  const existing = await prisma.faqItem.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    return createFailure("質問が見つかりません");
  }

  // カテゴリの存在確認
  const category = await prisma.faqCategory.findUnique({
    where: { id: parsed.data.categoryId },
    select: { id: true },
  });

  if (!category) {
    return createFailure("カテゴリが見つかりません");
  }

  // JSON → HTML 変換
  const { answerJson, ...rest } = parsed.data;
  const answerHtml = await renderEditorStateToHtmlLazy(answerJson);

  await prisma.faqItem.update({
    where: { id },
    data: {
      ...rest,
      answerJson: JSON.parse(answerJson),
      answerHtml,
    },
  });

  updateTag(CACHE_TAGS.FAQ);

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgeFaqCache(), {
    operation: "purgeFaqCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });

  return createSuccess("質問を更新しました");
});

/**
 * FAQ項目を削除
 */
export const deleteFaqItem = withPermission<[id: string], void>(
  "faq",
  "delete",
)(async (user, id): Promise<ActionResult<void>> => {
  const item = await prisma.faqItem.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!item) {
    return createFailure("質問が見つかりません");
  }

  await prisma.faqItem.delete({
    where: { id },
  });

  updateTag(CACHE_TAGS.FAQ);

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgeFaqCache(), {
    operation: "purgeFaqCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });

  return createSuccess("質問を削除しました");
});

/**
 * FAQ項目の順序を更新（カテゴリ内）
 */
export const reorderFaqItems = withPermission<
  [categoryId: string, orderedIds: string[]],
  void
>(
  "faq",
  "update",
)(async (user, categoryId, orderedIds): Promise<ActionResult<void>> => {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.faqItem.update({
        where: { id },
        data: { order: index, categoryId },
      }),
    ),
  );

  updateTag(CACHE_TAGS.FAQ);

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgeFaqCache(), {
    operation: "purgeFaqCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });

  return createSuccess("順序を更新しました");
});

/**
 * FAQ項目の公開状態を切り替え
 */
export const toggleFaqItemPublished = withPermission<[id: string], void>(
  "faq",
  "update",
)(async (user, id): Promise<ActionResult<void>> => {
  const item = await prisma.faqItem.findUnique({
    where: { id },
    select: { id: true, isPublished: true },
  });

  if (!item) {
    return createFailure("質問が見つかりません");
  }

  await prisma.faqItem.update({
    where: { id },
    data: { isPublished: !item.isPublished },
  });

  updateTag(CACHE_TAGS.FAQ);

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgeFaqCache(), {
    operation: "purgeFaqCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });

  return createSuccess("公開状態を変更しました");
});
