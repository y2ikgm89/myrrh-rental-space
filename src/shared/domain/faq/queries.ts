import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  FAQ_LOW_RATED_MIN_NOT_HELPFUL,
  FAQ_RECENT_DAYS,
  FAQ_STALE_DAYS,
} from "@/shared/domain/faq/constants";
import type {
  FaqCategoryListResult,
  FaqCategoryWithItems,
  FaqHealthSummary,
  FaqItemFilters,
  FaqItemListResult,
  FaqItemPagination,
  FaqItemSort,
  FaqItemWithCategory,
} from "@/shared/domain/faq/types";

function serializeFaqItem<
  T extends {
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    lastViewedAt: Date | null;
  },
>(item: T) {
  return {
    ...item,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    deletedAt: item.deletedAt?.toISOString() ?? null,
    lastViewedAt: item.lastViewedAt?.toISOString() ?? null,
  };
}

function serializeFaqCategory<
  T extends { createdAt: Date; updatedAt: Date; deletedAt: Date | null },
>(category: T) {
  return {
    ...category,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
    deletedAt: category.deletedAt?.toISOString() ?? null,
  };
}

const CATEGORY_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  iconEmoji: true,
  order: true,
  isActive: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ITEM_SELECT = {
  id: true,
  categoryId: true,
  question: true,
  answer: true,
  order: true,
  isPublished: true,
  publishedAt: true,
  deletedAt: true,
  viewCount: true,
  lastViewedAt: true,
  helpfulCount: true,
  notHelpfulCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ITEM_WITH_CATEGORY_SELECT = {
  ...ITEM_SELECT,
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
} as const;

export async function getFaqCategories(): Promise<FaqCategoryListResult> {
  const categories = await prisma.faqCategory.findMany({
    where: { deletedAt: null },
    select: {
      ...CATEGORY_SELECT,
      items: {
        where: { deletedAt: null },
        select: ITEM_SELECT,
        orderBy: { order: "asc" },
      },
    },
    orderBy: { order: "asc" },
  });

  return {
    categories: categories.map((category) => ({
      ...serializeFaqCategory(category),
      items: category.items.map(serializeFaqItem),
    })),
    total: categories.length,
  };
}

export async function getFaqCategoryById(
  id: string,
): Promise<FaqCategoryWithItems | null> {
  const category = await prisma.faqCategory.findFirst({
    where: { id, deletedAt: null },
    select: {
      ...CATEGORY_SELECT,
      items: {
        where: { deletedAt: null },
        select: ITEM_SELECT,
        orderBy: { order: "asc" },
      },
    },
  });

  if (!category) {
    return null;
  }

  return {
    ...serializeFaqCategory(category),
    items: category.items.map(serializeFaqItem),
  };
}

type FaqItemWhere = {
  deletedAt: null;
  category: { deletedAt: null };
  categoryId?: string;
  isPublished?: boolean;
  updatedAt?: { gte?: Date; lt?: Date };
  notHelpfulCount?: { gte: number };
  OR?: Array<{
    question?: { contains: string; mode: "insensitive" };
    answer?: { contains: string; mode: "insensitive" };
  }>;
};

function buildFaqItemWhere(filters: FaqItemFilters): FaqItemWhere {
  const where: FaqItemWhere = {
    deletedAt: null,
    category: { deletedAt: null },
  };

  if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }

  if (typeof filters.isPublished === "boolean") {
    where.isPublished = filters.isPublished;
  }

  if (filters.quickFilter === "recent") {
    const recentThreshold = new Date(
      Date.now() - FAQ_RECENT_DAYS * 24 * 60 * 60 * 1000,
    );
    where.updatedAt = { gte: recentThreshold };
  } else if (filters.quickFilter === "stale") {
    const staleThreshold = new Date(
      Date.now() - FAQ_STALE_DAYS * 24 * 60 * 60 * 1000,
    );
    where.updatedAt = { lt: staleThreshold };
  } else if (filters.quickFilter === "low-rated") {
    where.notHelpfulCount = { gte: FAQ_LOW_RATED_MIN_NOT_HELPFUL };
  }

  if (filters.search) {
    where.OR = [
      { question: { contains: filters.search, mode: "insensitive" } },
      { answer: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}

type FaqItemOrderBy =
  | Array<{ category: { order: "asc" | "desc" } } | { order: "asc" | "desc" }>
  | Array<{ updatedAt: "asc" | "desc" }>
  | Array<{ viewCount: "asc" | "desc" } | { updatedAt: "desc" }>
  | Array<{ helpfulCount: "asc" | "desc" } | { updatedAt: "desc" }>
  | Array<{ createdAt: "asc" | "desc" }>;

function buildFaqItemOrderBy(sort: FaqItemSort | undefined): FaqItemOrderBy {
  const order = sort?.sortOrder ?? "asc";
  switch (sort?.sortBy) {
    case "updatedAt":
      return [{ updatedAt: order }];
    case "viewCount":
      // 閲覧数ソート時は tie-breaker として updatedAt desc で新しい項目を優先
      return [{ viewCount: order }, { updatedAt: "desc" }];
    case "helpful":
      // 役立ち度ソート時も tie-breaker として updatedAt desc を付与
      return [{ helpfulCount: order }, { updatedAt: "desc" }];
    case "createdAt":
      return [{ createdAt: order }];
    case "order":
    default:
      return [{ category: { order: "asc" } }, { order }];
  }
}

export async function getFaqItems(
  filters: FaqItemFilters = {},
  pagination: FaqItemPagination = {},
  sort?: FaqItemSort,
): Promise<FaqItemListResult> {
  const { page = 1, limit = 20 } = pagination;
  const where = buildFaqItemWhere(filters);

  const [total, items] = await Promise.all([
    prisma.faqItem.count({ where }),
    prisma.faqItem.findMany({
      where,
      select: ITEM_WITH_CATEGORY_SELECT,
      orderBy: buildFaqItemOrderBy(sort),
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    items: items.map((item) => serializeFaqItem(item)),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * カテゴリ横断のヘルスサマリー（ランディングの「対応すべき件数」表示用）。
 * 件数のみを並列集計する軽量クエリ。
 */
export async function getFaqHealthSummary(): Promise<FaqHealthSummary> {
  const base = { deletedAt: null, category: { deletedAt: null } } as const;
  const staleThreshold = new Date(
    Date.now() - FAQ_STALE_DAYS * 24 * 60 * 60 * 1000,
  );

  const [draftCount, staleCount, lowRatedCount] = await Promise.all([
    prisma.faqItem.count({ where: { ...base, isPublished: false } }),
    prisma.faqItem.count({
      where: { ...base, isPublished: true, updatedAt: { lt: staleThreshold } },
    }),
    prisma.faqItem.count({
      where: {
        ...base,
        isPublished: true,
        notHelpfulCount: { gte: FAQ_LOW_RATED_MIN_NOT_HELPFUL },
      },
    }),
  ]);

  return { draftCount, staleCount, lowRatedCount };
}

export async function getFaqItemById(
  id: string,
): Promise<FaqItemWithCategory | null> {
  const item = await prisma.faqItem.findFirst({
    where: { id, deletedAt: null, category: { deletedAt: null } },
    select: ITEM_WITH_CATEGORY_SELECT,
  });

  if (!item) {
    return null;
  }

  return serializeFaqItem(item);
}

/**
 * Recycle Bin: ソフトデリート済み FAQ 項目（30 日以内）を取得
 * 注: 親カテゴリが削除済みかどうかは問わない（親ごと削除されていても復元対象）
 */
export async function getDeletedFaqItems(): Promise<FaqItemWithCategory[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const items = await prisma.faqItem.findMany({
    where: {
      deletedAt: { not: null, gte: thirtyDaysAgo },
    },
    select: ITEM_WITH_CATEGORY_SELECT,
    orderBy: { deletedAt: "desc" },
  });

  return items.map(serializeFaqItem);
}

/**
 * Recycle Bin: ソフトデリート済みカテゴリ（30 日以内）を取得
 */
export async function getDeletedFaqCategories(): Promise<
  FaqCategoryWithItems[]
> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const categories = await prisma.faqCategory.findMany({
    where: {
      deletedAt: { not: null, gte: thirtyDaysAgo },
    },
    select: {
      ...CATEGORY_SELECT,
      items: {
        // 親が削除済みのカテゴリに含まれる item は復元候補外として空配列で表示
        where: { deletedAt: null },
        select: ITEM_SELECT,
        orderBy: { order: "asc" },
      },
    },
    orderBy: { deletedAt: "desc" },
  });

  return categories.map((category) => ({
    ...serializeFaqCategory(category),
    items: category.items.map(serializeFaqItem),
  }));
}
