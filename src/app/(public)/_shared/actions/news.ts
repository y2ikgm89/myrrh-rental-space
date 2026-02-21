/**
 * 公開ニュースデータ取得
 *
 * 'use cache' + cacheTag で Next.js 16 キャッシュ管理
 */

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/lib/prisma";
import { safeFetch, ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/server";
import {
  CACHE_TAGS,
  CACHE_LIFE,
  getCacheTag,
  PAGINATION_DEFAULTS,
} from "@/shared/lib/constants";
import { slugParamSchema } from "@/shared/lib/validations/params";
import { toPlainObject } from "@/shared/lib/serialize";

// =============================================================================
// Types
// =============================================================================

const newsListSelect = {
  id: true,
  slug: true,
  title: true,
  publishedAt: true,
} as const;

const newsDetailSelect = {
  id: true,
  slug: true,
  title: true,
  contentHtml: true,
  publishedAt: true,
  contentWidth: true,
  contentWidthCustom: true,
  metaDescription: true,
  metaKeywords: true,
  ogpTitle: true,
  ogpDescription: true,
  ogpImageUrl: true,
} as const;

// =============================================================================
// Data Fetching
// =============================================================================

/**
 * 公開済みニュース一覧を取得（ページネーション付き）
 */
export async function getPublishedNewsList(
  page: number = 1,
  perPage: number = PAGINATION_DEFAULTS.public.default,
) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.NEWS);

  const skip = (page - 1) * perPage;

  const [items, totalCount] = await Promise.all([
    safeFetch({
      fetch: () =>
        prisma.news.findMany({
          where: { isPublished: true },
          select: newsListSelect,
          orderBy: { publishedAt: "desc" },
          skip,
          take: perPage,
        }),
      fallback: [],
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      operationName: "getPublishedNewsList",
    }),
    safeFetch({
      fetch: () =>
        prisma.news.count({
          where: { isPublished: true },
        }),
      fallback: 0,
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      operationName: "getPublishedNewsCount",
    }),
  ]);

  return {
    items: items.map((item) => ({
      ...item,
      publishedAt: item.publishedAt?.toISOString() ?? null,
    })),
    totalCount,
    totalPages: Math.ceil(totalCount / perPage),
    currentPage: page,
  };
}

/**
 * 公開済みニュース詳細を取得
 */
export async function getPublishedNewsItem(slug: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.NEWS, getCacheTag.news.detail(slug));

  if (!slugParamSchema.safeParse(slug).success) return null;

  const result = await safeFetch({
    fetch: () =>
      prisma.news.findFirst({
        where: {
          slug,
          isPublished: true,
        },
        select: newsDetailSelect,
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedNewsItem",
  });
  if (!result) return null;
  return toPlainObject({
    ...result,
    publishedAt: result.publishedAt?.toISOString() ?? null,
  });
}
