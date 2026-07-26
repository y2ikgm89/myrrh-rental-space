import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import {
  CACHE_LIFE,
  CACHE_TAGS,
  PAGINATION_DEFAULTS,
  getCacheTag,
} from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { calcTotalPages, paginate } from "@/shared/lib/pagination";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import { slugParamSchema } from "@/shared/lib/validations/params";

/**
 * 公開ニュースクエリの共通 where 句。News model に deletedAt 列はないため
 * isPublished gate に加え、`publishedAt <= now` で予約公開（未来日時指定）の
 * 早期露出を防ぐ。`now` は呼び出しの都度評価する（呼び出し元でキャプチャした
 * `Date` を渡さないこと — この関数の呼び出し自体が `'use cache'` 関数本体内で
 * 行われるため、生成された `Prisma.NewsWhereInput` は cacheLife(PUBLIC_CONTENT)
 * の revalidate window（既定 1 時間）でしか鮮度が保証されない。予約公開時刻
 * ちょうどでの露出精度が必要な場合は cron 側のタグ再検証で補う）。
 * 新規 query 追加時の publish gate 漏れを構造的に防ぐため、公開 query は必ず
 * この helper 経由で where を組み立てる。
 */
export function publicNewsWhere(now: Date = new Date()): Prisma.NewsWhereInput {
  return {
    isPublished: true,
    publishedAt: { lte: now },
  };
}

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

function attachNewsUrl<T extends { slug: string }>(
  item: T,
): T & { url: string } {
  return {
    ...item,
    url: `/news/${item.slug}`,
  };
}

export async function getPublishedNewsList(
  page: number = 1,
  perPage: number = PAGINATION_DEFAULTS.public.default,
  search: string = "",
) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.NEWS);

  const { skip, take } = paginate({ page, limit: perPage });

  const where = {
    ...publicNewsWhere(),
    ...(search
      ? { title: { contains: search, mode: "insensitive" as const } }
      : {}),
  };

  const [items, totalCount] = await Promise.all([
    safeFetch({
      fetch: () =>
        prisma.news.findMany({
          where,
          select: newsListSelect,
          orderBy: { publishedAt: "desc" },
          skip,
          take,
        }),
      fallback: [],
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      operationName: "getPublishedNewsList",
    }),
    safeFetch({
      fetch: () => prisma.news.count({ where }),
      fallback: 0,
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      operationName: "getPublishedNewsCount",
    }),
  ]);

  return {
    items: toPlainArray(
      items.map((item) => {
        const mapped = attachNewsUrl(item);
        return {
          ...mapped,
          publishedAt: mapped.publishedAt?.toISOString() ?? null,
        };
      }),
    ),
    totalCount,
    totalPages: calcTotalPages(totalCount, perPage),
    currentPage: page,
  };
}

export async function getPublishedNewsItem(slug: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.NEWS, getCacheTag.news.detail(slug));

  if (!slugParamSchema.safeParse(slug).success) return null;

  const result = await safeFetch({
    fetch: () =>
      prisma.news.findFirst({
        where: {
          ...publicNewsWhere(),
          slug,
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
    ...attachNewsUrl(result),
    publishedAt: result.publishedAt?.toISOString() ?? null,
  });
}

export async function getPublishedNews(maxItems: number) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.NEWS);

  const news = await safeFetch({
    fetch: () =>
      prisma.news.findMany({
        where: { ...publicNewsWhere() },
        select: newsListSelect,
        orderBy: { publishedAt: "desc" },
        take: maxItems,
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedNews",
  });

  return toPlainArray(
    news.map((item) => {
      const mapped = attachNewsUrl(item);
      return {
        ...mapped,
        publishedAt: mapped.publishedAt?.toISOString() ?? null,
      };
    }),
  );
}
