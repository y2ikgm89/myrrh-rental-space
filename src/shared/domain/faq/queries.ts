import "server-only";

import { prisma } from "@/shared/db/prisma";
import type {
  FaqCategoryListResult,
  FaqCategoryWithItems,
  FaqItemFilters,
  FaqItemListResult,
  FaqItemPagination,
  FaqItemWithCategory,
} from "@/shared/domain/faq/types";

function serializeFaqItem<
  T extends { publishedAt: Date | null; createdAt: Date; updatedAt: Date },
>(item: T) {
  return {
    ...item,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function getFaqCategories(): Promise<FaqCategoryListResult> {
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
    categories: categories.map((category) => ({
      ...category,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
      items: category.items.map(serializeFaqItem),
    })),
    total: categories.length,
  };
}

export async function getFaqCategoryById(
  id: string,
): Promise<FaqCategoryWithItems | null> {
  const category = await prisma.faqCategory.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { order: "asc" },
      },
    },
  });

  if (!category) {
    return null;
  }

  return {
    ...category,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
    items: category.items.map(serializeFaqItem),
  };
}

type FaqItemWhere = {
  categoryId?: string;
  isPublished?: boolean;
  OR?: Array<{
    question?: { contains: string; mode: "insensitive" };
    answerHtml?: { contains: string; mode: "insensitive" };
  }>;
};

function buildFaqItemWhere(filters: FaqItemFilters): FaqItemWhere {
  const where: FaqItemWhere = {};

  if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }

  if (typeof filters.isPublished === "boolean") {
    where.isPublished = filters.isPublished;
  }

  if (filters.search) {
    where.OR = [
      { question: { contains: filters.search, mode: "insensitive" } },
      { answerHtml: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function getFaqItems(
  filters: FaqItemFilters = {},
  pagination: FaqItemPagination = {},
): Promise<FaqItemListResult> {
  const { page = 1, limit = 20 } = pagination;
  const where = buildFaqItemWhere(filters);

  const [total, items] = await Promise.all([
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
    items: items.map((item) => serializeFaqItem(item)),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getFaqItemById(
  id: string,
): Promise<FaqItemWithCategory | null> {
  const item = await prisma.faqItem.findUnique({
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
  });

  if (!item) {
    return null;
  }

  return serializeFaqItem(item);
}
