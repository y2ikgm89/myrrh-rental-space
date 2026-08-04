import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { PostStatus } from "@/shared/lib/validations/enums/prisma-types";
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
import { buildPostCanonicalPath } from "@/shared/domain/posts/routing";

/**
 * 公開ポストクエリの共通 where 句。`status: PUBLISHED` に加え
 * `publishedAt <= now` で予約公開（未来日時指定）の早期露出を防ぐ。
 * `publishedAt` が null の PUBLISHED 行は `lte` に一致せず非公開扱い
 * （`publishPost` は必ず `publishedAt` をセットする）。
 * `now` は呼び出しの都度評価する（呼び出し元でキャプチャした `Date` を
 * 渡さないこと — この関数の呼び出し自体が `'use cache'` 関数本体内で
 * 行われるため、生成された where は cacheLife(PUBLIC_CONTENT) の
 * revalidate window（既定 1 時間）でしか鮮度が保証されない。予約公開時刻
 * ちょうどでの露出精度が必要な場合は cron 側のタグ再検証で補う）。
 * 新規 query 追加時の publish gate 漏れを構造的に防ぐため、公開 query は必ず
 * この helper 経由で where を組み立てる。
 */
export function publicPostsWhere(
  now: Date = new Date(),
): Prisma.PostWhereInput {
  return {
    deletedAt: null,
    status: PostStatus.PUBLISHED,
    publishedAt: { lte: now },
  };
}

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
} as const satisfies Prisma.PostSelect;

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
} as const satisfies Prisma.PostSelect;

function attachPostUrl<
  T extends {
    slug: string;
    publishedAt?: Date | null;
    category?: { slug: string } | null;
  },
>(post: T): T & { url: string } {
  return {
    ...post,
    url: buildPostCanonicalPath(post),
  };
}

export async function getPublishedPostsList(
  page: number = 1,
  perPage: number = PAGINATION_DEFAULTS.public.default,
  search: string = "",
  categorySlug: string = "",
  tagSlug: string = "",
) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.POSTS, CACHE_TAGS.POST_TAGS);

  const { skip, take } = paginate({ page, limit: perPage });

  const where: Prisma.PostWhereInput = {
    ...publicPostsWhere(),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { excerpt: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(categorySlug ? { category: { slug: categorySlug } } : {}),
    ...(tagSlug ? { postTags: { some: { tag: { slug: tagSlug } } } } : {}),
  };

  const [posts, totalCount] = await Promise.all([
    safeFetch({
      fetch: () =>
        prisma.post.findMany({
          where,
          select: postListSelect,
          orderBy: { publishedAt: "desc" },
          skip,
          take,
        }),
      fallback: [],
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      operationName: "getPublishedPostsList",
    }),
    safeFetch({
      fetch: () => prisma.post.count({ where }),
      fallback: 0,
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      operationName: "getPublishedPostsCount",
    }),
  ]);

  return {
    posts: toPlainArray(
      posts.map((post) => {
        const mapped = attachPostUrl(post);
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
          ...publicPostsWhere(),
        },
        select: postDetailSelect,
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedPost",
  });

  if (!result) return null;

  return toPlainObject(attachPostUrl(result));
}

export async function getPublishedPosts(maxItems: number, categoryId?: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.POSTS);

  const posts = await safeFetch({
    fetch: () =>
      prisma.post.findMany({
        where: {
          ...publicPostsWhere(),
          ...(categoryId ? { categoryId } : {}),
        },
        select: {
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
        },
        orderBy: { publishedAt: "desc" },
        take: maxItems,
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedPosts",
  });

  return toPlainArray(
    posts.map((post) => {
      const mapped = attachPostUrl(post);
      return {
        ...mapped,
        publishedAt: mapped.publishedAt?.toISOString() ?? null,
      };
    }),
  );
}

export async function getPostCategories() {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.POST_CATEGORIES);

  const categories = await safeFetch({
    fetch: () =>
      prisma.postCategory.findMany({
        select: { id: true, name: true, slug: true },
        orderBy: { order: "asc" },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPostCategories",
  });

  return toPlainArray(categories);
}

export async function getPostCategoryBySlug(slug: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.POST_CATEGORIES);

  if (!slugParamSchema.safeParse(slug).success) return null;

  const category = await safeFetch({
    fetch: () =>
      prisma.postCategory.findFirst({
        where: { slug },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          metaTitle: true,
          metaDescription: true,
          ogpImageUrl: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPostCategoryBySlug",
  });

  return category ? toPlainObject(category) : null;
}

export async function getPostTagBySlug(slug: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.POST_TAGS);

  if (!slugParamSchema.safeParse(slug).success) return null;

  const tag = await safeFetch({
    fetch: () =>
      prisma.postTag.findFirst({
        where: { slug },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          metaTitle: true,
          metaDescription: true,
          ogpImageUrl: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPostTagBySlug",
  });

  return tag ? toPlainObject(tag) : null;
}

export async function getAllPublishedTags() {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.POST_TAGS, CACHE_TAGS.POSTS);

  const tags = await safeFetch({
    fetch: () =>
      prisma.postTag.findMany({
        where: {
          posts: {
            some: {
              post: publicPostsWhere(),
            },
          },
        },
        select: { id: true, name: true, slug: true },
        orderBy: { name: "asc" },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getAllPublishedTags",
  });

  return toPlainArray(tags);
}
