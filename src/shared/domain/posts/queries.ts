import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { PostStatus } from "@generated/prisma/enums";
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
  search: string = "",
  categorySlug: string = "",
  tagSlug: string = "",
) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.POSTS, CACHE_TAGS.PERMALINK, CACHE_TAGS.POST_TAGS);

  const skip = (page - 1) * perPage;

  const where = {
    status: PostStatus.PUBLISHED,
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

  const [{ posts, totalCount }, settings] = await Promise.all([
    (async () => {
      const [records, count] = await Promise.all([
        safeFetch({
          fetch: () =>
            prisma.post.findMany({
              where,
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
          fetch: () => prisma.post.count({ where }),
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
    safeFetch({
      fetch: () =>
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
      fallback: [],
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      operationName: "getPublishedPosts",
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
              post: {
                status: PostStatus.PUBLISHED,
              },
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
