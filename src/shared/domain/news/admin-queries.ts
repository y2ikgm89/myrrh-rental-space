import "server-only";

import { prisma } from "@/shared/db/prisma";
import { calcTotalPages, paginate } from "@/shared/lib/pagination";
import type { LayoutWidth } from "@generated/prisma/enums";
import type { Prisma } from "@generated/prisma/client";

type NewsWhereInput = Prisma.NewsWhereInput;
import type {
  GetNewsListResult,
  NewsData,
  NewsFilters,
  NewsListItem,
  NewsPagination,
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

// JST-DRIFT-03: timeZone 未指定だと server-local (Cloud Run UTC) で解釈され
// publishedAt / createdAt / updatedAt の JST 表示が 9 時間ずれる silent bug。
// date-format.ts の SSoT 契約 (CLAUDE.md 絶対規約 10) に従い明示的に JST 固定。
const adminDateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
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
  const { sortBy = "createdAt", sortOrder = "desc" } = pagination;
  const { skip, take, page, limit } = paginate(pagination);
  const where = buildNewsWhere(filters);

  const [total, news] = await Promise.all([
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
      skip,
      take,
    }),
  ]);

  return {
    news: news.map(toNewsListItem),
    total,
    page,
    limit,
    totalPages: calcTotalPages(total, limit),
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
