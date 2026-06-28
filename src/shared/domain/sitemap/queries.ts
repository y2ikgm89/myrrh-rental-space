import "server-only";

import { prisma } from "@/shared/db/prisma";
import { logger } from "@/shared/lib/logger";
import { EventStatus, PostStatus } from "@generated/prisma/enums";

/**
 * Sitemap 用ドメイン query。
 *
 * 設計:
 * - lastModified は当該行の write 時のみ更新される（category/tag rename を post に
 *   cascade させない、event ticket 編集を event に cascade させない等）。これは
 *   Google が <lastmod> を best-effort 扱いする仕様と整合し、cache 無効化は
 *   `invalidateSiteWideCache` の SITEMAP co-purge で別系統に分離されている。
 * - 8 collection + system page index を `Promise.allSettled` で並列実行し、1 collection
 *   の失敗で /sitemap.xml 全体を 500 にしない（fail-soft / partial degradation）。
 */

export type SitemapSpace = {
  slug: string;
  updatedAt: Date;
};

export type SitemapNews = {
  slug: string;
  updatedAt: Date;
};

export type SitemapPost = {
  slug: string;
  updatedAt: Date;
  publishedAt: Date | null;
  category: {
    slug: string;
  } | null;
};

export type SitemapPostCategory = {
  slug: string;
  updatedAt: Date;
};

export type SitemapPostTag = {
  slug: string;
  updatedAt: Date;
};

export type SitemapCustomPage = {
  slug: string;
  updatedAt: Date;
};

export type SitemapEvent = {
  slug: string;
  updatedAt: Date;
};

export type SitemapTerms = {
  slug: string;
  updatedAt: Date;
};

/**
 * 静的システムページ slug → 最終更新時刻のマップ。
 *
 * Page.updatedAt と各 Section.updatedAt の max を集約する。
 * - Page.updatedAt は SEO/OGP 編集や isPublished 切替で bump
 * - Section.updatedAt はコンテンツ編集（page-hero / paragraph / faq 等）で bump
 * - section が無い／全て isActive=false の row は Page.updatedAt のみ
 *
 * 未掲載（isPublished=false）あるいは DB row 不在の slug は Map に entry を持たない。
 */
export type SystemPageLastModifiedMap = ReadonlyMap<string, Date>;

export interface SitemapContentData {
  spaces: SitemapSpace[];
  news: SitemapNews[];
  posts: SitemapPost[];
  postCategories: SitemapPostCategory[];
  postTags: SitemapPostTag[];
  customPages: SitemapCustomPage[];
  events: SitemapEvent[];
  terms: SitemapTerms[];
  systemPageLastModified: SystemPageLastModifiedMap;
}

/** sitemap.ts の STATIC_PAGES から駆動される静的システムページ slug 集合。 */
const STATIC_SYSTEM_PAGE_SLUGS = [
  "home",
  "about",
  "access",
  "contact",
  "faq",
  "reservation",
  "terms",
] as const;

export async function getSitemapContentData(): Promise<SitemapContentData> {
  const [
    spacesResult,
    newsResult,
    postsResult,
    postCategoriesResult,
    postTagsResult,
    customPagesResult,
    eventsResult,
    termsResult,
    systemPageLastModifiedResult,
  ] = await Promise.allSettled([
    // Space は deletedAt 列を持たず isActive=false が soft-delete 代替 (schema.prisma:429-500 確認済み)
    prisma.space.findMany({
      where: { isPublished: true, isActive: true },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.news.findMany({
      where: { isPublished: true },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.post.findMany({
      where: { status: PostStatus.PUBLISHED },
      select: {
        slug: true,
        updatedAt: true,
        publishedAt: true,
        category: {
          select: {
            slug: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.postCategory.findMany({
      where: { posts: { some: { status: PostStatus.PUBLISHED } } },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.postTag.findMany({
      where: { posts: { some: { post: { status: PostStatus.PUBLISHED } } } },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.page.findMany({
      where: {
        isPublished: true,
        isActive: true,
        isSystemPage: false,
      },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.event.findMany({
      where: {
        status: EventStatus.PUBLISHED,
        deletedAt: null,
      },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.termsDocument.findMany({
      where: { deletedAt: null, isPublished: true },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    fetchSystemPageLastModified(),
  ]);

  return {
    spaces: collectionOrFallback(spacesResult, "spaces", []),
    news: collectionOrFallback(newsResult, "news", []),
    posts: collectionOrFallback(postsResult, "posts", []),
    postCategories: collectionOrFallback(
      postCategoriesResult,
      "postCategories",
      [],
    ),
    postTags: collectionOrFallback(postTagsResult, "postTags", []),
    customPages: collectionOrFallback(customPagesResult, "customPages", []),
    events: collectionOrFallback(eventsResult, "events", []),
    terms: collectionOrFallback(termsResult, "terms", []),
    systemPageLastModified: collectionOrFallback(
      systemPageLastModifiedResult,
      "systemPageLastModified",
      new Map<string, Date>(),
    ),
  };
}

function collectionOrFallback<T>(
  result: PromiseSettledResult<T>,
  collection: keyof SitemapContentData,
  fallback: T,
): T {
  if (result.status === "fulfilled") return result.value;
  logger.error("getSitemapContentData partial failure", {
    collection,
    error:
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason),
  });
  return fallback;
}

async function fetchSystemPageLastModified(): Promise<SystemPageLastModifiedMap> {
  const pages = await prisma.page.findMany({
    where: {
      slug: { in: [...STATIC_SYSTEM_PAGE_SLUGS] },
      isSystemPage: true,
      isPublished: true,
    },
    select: {
      slug: true,
      updatedAt: true,
      sections: {
        where: { isActive: true },
        select: { updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });

  const map = new Map<string, Date>();
  for (const page of pages) {
    const sectionUpdatedAt = page.sections[0]?.updatedAt;
    const effective =
      sectionUpdatedAt && sectionUpdatedAt > page.updatedAt
        ? sectionUpdatedAt
        : page.updatedAt;
    map.set(page.slug, effective);
  }
  return map;
}
