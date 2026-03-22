import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { PostStatus } from "@/shared/db/enums";
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
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import { slugParamSchema } from "@/shared/lib/validations/params";
import { getPermalinkSettings } from "@/shared/domain/settings/queries/display";
import { buildPostCanonicalPath } from "@/shared/domain/posts/routing";

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

function attachPostUrl<
  T extends {
    slug: string;
    publishedAt?: Date | null;
    category?: { slug: string } | null;
  },
>(
  post: T,
  settings: Awaited<ReturnType<typeof getPermalinkSettings>>,
): T & { url: string } {
  return {
    ...post,
    url: buildPostCanonicalPath(post, settings ?? undefined),
  };
}

export async function getPublishedPostsList(
  page: number = 1,
  perPage: number = PAGINATION_DEFAULTS.public.default,
) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.POSTS, CACHE_TAGS.PERMALINK);

  const skip = (page - 1) * perPage;

  const [{ posts, totalCount }, settings] = await Promise.all([
    (async () => {
      const [records, count] = await Promise.all([
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

      return { posts: records, totalCount: count };
    })(),
    getPermalinkSettings(),
  ]);

  return {
    posts: toPlainArray(
      posts.map((post) => {
        const mapped = attachPostUrl(post, settings);
        return {
          ...mapped,
          publishedAt: mapped.publishedAt?.toISOString() ?? null,
        };
      }),
    ),
    totalCount,
    totalPages: Math.ceil(totalCount / perPage),
    currentPage: page,
  };
}

export async function getPublishedPost(slug: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(
    CACHE_TAGS.POSTS,
    CACHE_TAGS.PERMALINK,
    getCacheTag.posts.detail(slug),
  );

  if (!slugParamSchema.safeParse(slug).success) return null;

  const [result, settings] = await Promise.all([
    safeFetch({
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
    }),
    getPermalinkSettings(),
  ]);

  if (!result) return null;

  return toPlainObject(attachPostUrl(result, settings));
}

export async function getPublishedPosts(maxItems: number, categoryId?: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.POSTS, CACHE_TAGS.PERMALINK);

  const [posts, settings] = await Promise.all([
    prisma.post.findMany({
      where: {
        status: PostStatus.PUBLISHED,
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
    getPermalinkSettings(),
  ]);

  return toPlainArray(
    posts.map((post) => {
      const mapped = attachPostUrl(post, settings);
      return {
        ...mapped,
        publishedAt: mapped.publishedAt?.toISOString() ?? null,
      };
    }),
  );
}
