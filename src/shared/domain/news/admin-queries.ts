import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { LayoutWidth } from "@/shared/db/enums";
import type { NewsWhereInput } from "@/shared/types/prisma";
import type {
  GetNewsListResult,
  NewsData,
  NewsFilters,
  NewsListItem,
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

const adminDateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function toNewsListItem(item: {
  id: string;
  slug: string;
  title: string;
  contentHtml: string;
  contentJson: unknown;
  isPublished: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  contentWidth: LayoutWidth | null;
  contentWidthCustom: number | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  ogpTitle: string | null;
  ogpDescription: string | null;
  ogpImageUrl: string | null;
}): NewsListItem {
  return {
    ...item,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    publishedAtLabel: item.publishedAt
      ? adminDateTimeFormatter.format(item.publishedAt)
      : null,
    createdAtLabel: adminDateTimeFormatter.format(item.createdAt),
  };
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
    news: news.map(toNewsListItem),
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
