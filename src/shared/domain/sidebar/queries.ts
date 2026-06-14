import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { PostStatus } from "@generated/prisma/enums";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { toPlainArray } from "@/shared/lib/serialize";
import type { SidebarWidget } from "@/shared/lib/validations/sidebar";
import { buildPostCanonicalPath } from "@/shared/domain/posts/routing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SidebarPostItem {
  id: string;
  title: string;
  url: string;
  publishedAt: string | null;
  thumbnailUrl: string;
  category: { name: string; slug: string } | null;
}

export interface SidebarCategoryItem {
  id: string;
  name: string;
  slug: string;
  postCount: number;
}

export interface SidebarTagItem {
  id: string;
  name: string;
  slug: string;
}

export interface SidebarData {
  recentPosts: SidebarPostItem[];
  popularPosts: SidebarPostItem[];
  categories: SidebarCategoryItem[];
  tags: SidebarTagItem[];
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export async function getSidebarData(
  widgets: SidebarWidget[],
  recentCount: number,
  popularCount: number,
): Promise<SidebarData> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SIDEBAR_DATA);

  const enabledTypes = new Set(
    widgets.filter((w) => w.enabled).map((w) => w.type),
  );

  const needRecent = enabledTypes.has("recent");
  const needPopular = enabledTypes.has("popular");
  const needCategories = enabledTypes.has("categories");
  const needTags = enabledTypes.has("tags");

  const publishedWhere = { status: PostStatus.PUBLISHED };

  const postSelect = {
    id: true,
    slug: true,
    title: true,
    publishedAt: true,
    thumbnailUrl: true,
    category: { select: { name: true, slug: true } },
  } as const;

  const [recentRaw, popularRaw, categoriesRaw, tagsRaw] = await Promise.all([
    needRecent
      ? safeFetch({
          fetch: () =>
            prisma.post.findMany({
              where: publishedWhere,
              select: postSelect,
              orderBy: { publishedAt: "desc" },
              take: recentCount,
            }),
          fallback: [],
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.LOW,
          operationName: "getSidebarRecentPosts",
        })
      : Promise.resolve([]),

    needPopular
      ? safeFetch({
          fetch: () =>
            prisma.post.findMany({
              where: publishedWhere,
              select: postSelect,
              orderBy: { viewCount: "desc" },
              take: popularCount,
            }),
          fallback: [],
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.LOW,
          operationName: "getSidebarPopularPosts",
        })
      : Promise.resolve([]),

    needCategories
      ? safeFetch({
          fetch: () =>
            prisma.postCategory.findMany({
              select: {
                id: true,
                name: true,
                slug: true,
                _count: {
                  select: {
                    posts: { where: publishedWhere },
                  },
                },
              },
              orderBy: { name: "asc" },
            }),
          fallback: [],
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.LOW,
          operationName: "getSidebarCategories",
        })
      : Promise.resolve([]),

    needTags
      ? safeFetch({
          fetch: () =>
            prisma.postTag.findMany({
              where: { posts: { some: { post: publishedWhere } } },
              select: { id: true, name: true, slug: true },
              orderBy: { name: "asc" },
            }),
          fallback: [],
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.LOW,
          operationName: "getSidebarTags",
        })
      : Promise.resolve([]),
  ]);

  const mapPost = (p: {
    id: string;
    slug: string;
    title: string;
    publishedAt: Date | null;
    thumbnailUrl: string;
    category: { name: string; slug: string } | null;
  }): SidebarPostItem => ({
    id: p.id,
    title: p.title,
    url: buildPostCanonicalPath(p),
    publishedAt: p.publishedAt?.toISOString() ?? null,
    thumbnailUrl: p.thumbnailUrl,
    category: p.category,
  });

  const mapCategory = (c: {
    id: string;
    name: string;
    slug: string;
    _count: { posts: number };
  }): SidebarCategoryItem => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    postCount: c._count.posts,
  });

  return {
    recentPosts: toPlainArray(recentRaw.map(mapPost)),
    popularPosts: toPlainArray(popularRaw.map(mapPost)),
    categories: toPlainArray(categoriesRaw.map(mapCategory)),
    tags: toPlainArray(tagsRaw),
  };
}
