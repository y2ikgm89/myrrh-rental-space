/**
 * 公開ブログ記事データ取得
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
import { PostStatus } from "@/shared/generated/prisma/enums";
import { slugParamSchema } from "@/shared/lib/validations/params";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";

// =============================================================================
// Types
// =============================================================================

const postListSelect = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  thumbnailUrl: true,
  publishedAt: true,
  category: {
    select: {
      name: true,
      slug: true,
    },
  },
} as const;

const postDetailSelect = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  contentHtml: true,
  thumbnailUrl: true,
  publishedAt: true,
  contentWidth: true,
  contentWidthCustom: true,
  metaDescription: true,
  metaKeywords: true,
  ogpTitle: true,
  ogpDescription: true,
  ogpImageUrl: true,
  category: {
    select: {
      name: true,
      slug: true,
    },
  },
  author: {
    select: {
      name: true,
    },
  },
  postTags: {
    select: {
      tag: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
  },
} as const;

// =============================================================================
// Data Fetching
// =============================================================================

/**
 * 公開済みブログ記事一覧を取得（ページネーション付き）
 */
export async function getPublishedPostsList(
  page: number = 1,
  perPage: number = PAGINATION_DEFAULTS.public.default,
) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.POSTS);

  const skip = (page - 1) * perPage;

  const [posts, totalCount] = await Promise.all([
    safeFetch({
      fetch: () =>
        prisma.post.findMany({
          where: { status: PostStatus.PUBLISHED },
          select: postListSelect,
          orderBy: { publishedAt: "desc" },
          skip,
          take: perPage,
        }),
      fallback: [],
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      operationName: "getPublishedPostsList",
    }),
    safeFetch({
      fetch: () =>
        prisma.post.count({
          where: { status: PostStatus.PUBLISHED },
        }),
      fallback: 0,
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      operationName: "getPublishedPostsCount",
    }),
  ]);

  return {
    posts: toPlainArray(
      posts.map((p) => ({
        ...p,
        publishedAt: p.publishedAt?.toISOString() ?? null,
      })),
    ),
    totalCount,
    totalPages: Math.ceil(totalCount / perPage),
    currentPage: page,
  };
}

/**
 * 公開済みブログ記事詳細を取得
 */
export async function getPublishedPost(slug: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.POSTS, getCacheTag.posts.detail(slug));

  if (!slugParamSchema.safeParse(slug).success) return null;

  const result = await safeFetch({
    fetch: () =>
      prisma.post.findFirst({
        where: {
          slug,
          status: PostStatus.PUBLISHED,
        },
        select: postDetailSelect,
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedPost",
  });
  return toPlainObject(result);
}
