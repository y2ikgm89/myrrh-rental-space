import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { NewsWhereInput } from "@/shared/types/prisma";
import type {
  GetNewsListResult,
  NewsData,
  NewsFilters,
  NewsPagination,
  NewsVersionData,
} from "@/shared/domain/news/types";

function buildNewsWhere(filters: NewsFilters): NewsWhereInput {
  const where: NewsWhereInput = {};

  if (filters.status === "PUBLISHED") {
    where.isPublished = true;
  } else if (filters.status === "DRAFT") {
    where.isPublished = false;
  }

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { contentHtml: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function getNewsList(
  filters: NewsFilters = {},
  pagination: NewsPagination = {},
): Promise<GetNewsListResult> {
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = pagination;
  const where = buildNewsWhere(filters);

  const [total, news] = await prisma.$transaction([
    prisma.news.count({ where }),
    prisma.news.findMany({
      where,
      select: {
        id: true,
        slug: true,
        title: true,
        contentHtml: true,
        contentJson: true,
        isPublished: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        contentWidth: true,
        contentWidthCustom: true,
        metaDescription: true,
        metaKeywords: true,
        ogpTitle: true,
        ogpDescription: true,
        ogpImageUrl: true,
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    news: news.map((item) => ({
      ...item,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getNewsById(id: string): Promise<NewsData | null> {
  const news = await prisma.news.findUnique({
    where: { id },
  });

  if (!news) {
    return null;
  }

  return {
    ...news,
    publishedAt: news.publishedAt?.toISOString() ?? null,
    createdAt: news.createdAt.toISOString(),
    updatedAt: news.updatedAt.toISOString(),
  };
}

export async function getNewsVersions(
  newsId: string,
): Promise<NewsVersionData[]> {
  const versions = await prisma.newsVersion.findMany({
    where: { newsId },
    select: {
      id: true,
      newsId: true,
      version: true,
      contentHtml: true,
      contentJson: true,
      createdAt: true,
      createdBy: true,
    },
    orderBy: { version: "desc" },
  });

  return versions.map((version) => ({
    ...version,
    createdAt: version.createdAt.toISOString(),
  }));
}
