/**
 * XMLサイトマップ生成
 *
 * 設計方針:
 * - priority/changefreq は Google が無視するため emit しない
 * - lastmod は実コンテンツ駆動（new Date() は使わない）— Google の「if your page
 *   changed 7 years ago, but you're telling us in the lastmod element that it
 *   changed yesterday, eventually we're not going to believe you anymore」
 *   反パターンを回避
 * - 空 collection に対する listing entry は emit しない（fake lastmod で advertise しない）
 * - 全 slug は `encodeURIComponent` で escape — Next.js sitemap は <loc> を auto-encode しない
 * - 部分失敗（DB 一部 query 失敗）でも残りの collection は通常通り emit（fail-soft）
 * - catastrophic 失敗時は STATIC_PAGES のみ返す（Googlebot に 500 を返さない）
 *
 * @see https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */

import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getSitemapContentData } from "@/shared/domain/sitemap/queries";
import { getBaseUrl } from "@/shared/lib/constants";
import {
  buildPostCanonicalPath,
  buildCategoryPath,
  buildTagPath,
} from "@/shared/domain/posts/routing";
import {
  getFeatureFilterContext,
  isUrlDisabled,
} from "@/shared/lib/features/check";
import { isReservedPath } from "@/shared/lib/slug-validation";
import { logger } from "@/shared/lib/logger";

// =============================================================================
// Types
// =============================================================================

type SitemapEntry = MetadataRoute.Sitemap[number];

interface StaticPageDefinition {
  /** sitemap に出す URL path（先頭スラッシュあり） */
  readonly path: string;
  /** Page table の slug（home → "/", それ以外は path.slice(1) と一致） */
  readonly slug: string;
}

// =============================================================================
// Constants
// =============================================================================

const BASE_URL = getBaseUrl();

/**
 * 静的システムページ定義。
 *
 * - lastModified は Page.updatedAt と各 Section.updatedAt の max を集約（queries.ts）
 * - DB row 不在 / isPublished=false の場合は sitemap から省略（fake lastmod を避けるため）
 * - リスト維持は __tests__/unit/app/sitemap-static-pages.test.ts の drift gate で強制
 *
 * `feature module` 単位の OFF（access/contact/faq/reservation）は `isUrlDisabled` で
 * filter。`/`（home）/`/about`/`/terms` は法的・基幹ルートのため常時 emit。
 */
export const STATIC_PAGES = [
  { path: "/", slug: "home" },
  { path: "/about", slug: "about" },
  { path: "/access", slug: "access" },
  { path: "/contact", slug: "contact" },
  { path: "/faq", slug: "faq" },
  { path: "/reservation", slug: "reservation" },
  { path: "/terms", slug: "terms" },
] as const satisfies readonly StaticPageDefinition[];

// =============================================================================
// Helpers
// =============================================================================

/** 配列が空なら null、それ以外は最大 updatedAt を返す（implicit sort 依存を回避）。 */
function maxUpdatedAt<T extends { readonly updatedAt: Date }>(
  rows: readonly T[],
): Date | null {
  let max: Date | null = null;
  for (const row of rows) {
    if (max === null || row.updatedAt > max) max = row.updatedAt;
  }
  return max;
}

/** path 中の slug 部分のみを encode（先頭の "/" は維持）。 */
function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => (segment === "" ? "" : encodeURIComponent(segment)))
    .join("/");
}

/** STATIC_PAGES 専用フォールバック — catastrophic 失敗時に最低限の sitemap を返す。 */
function fallbackStaticSitemap(): MetadataRoute.Sitemap {
  return STATIC_PAGES.map(({ path }) => ({ url: `${BASE_URL}${path}` }));
}

// =============================================================================
// Sitemap Generation
// =============================================================================

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // build prerender skip — `getFeatureFilterContext` 内部の
  // `getFeatureModulesSettings` は `'use cache' + safeFetch({fallback: null})` 構造で、
  // Dockerfile builder の placeholder DATABASE_URL では fallback null が空 Map として
  // 静的シェルに baking され Cloudflare HIT で恒久汚染する。
  // 公式 canonical pattern (.claude/rules/db-and-domain.md §6) に従い動的化する。
  await connection();

  const startedAt = Date.now();
  let content: Awaited<ReturnType<typeof getSitemapContentData>>;
  let featureCtx: Awaited<ReturnType<typeof getFeatureFilterContext>>;
  try {
    [content, featureCtx] = await Promise.all([
      getSitemapContentData(),
      getFeatureFilterContext(),
    ]);
  } catch (error) {
    logger.error(
      "sitemap() catastrophic failure — returning STATIC_PAGES only",
      {
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      },
    );
    return fallbackStaticSitemap();
  }

  const {
    spaces,
    news,
    posts,
    postCategories,
    postTags,
    customPages,
    events,
    terms,
    systemPageLastModified,
  } = content;
  const { enabled, disabledRoutes, disabledPageSlugs } = featureCtx;

  const entries: SitemapEntry[] = [];

  // ==========================================================================
  // 1. 静的システムページ — feature gate（isUrlDisabled）と Page.updatedAt 駆動
  // ==========================================================================
  for (const { path, slug } of STATIC_PAGES) {
    if (isUrlDisabled(path, disabledRoutes)) continue;
    const lastModified = systemPageLastModified.get(slug);
    if (!lastModified) continue; // DB row 不在 / 非公開なら省略
    entries.push({ url: `${BASE_URL}${path}`, lastModified });
  }

  // ==========================================================================
  // 2. listing ルート — feature ON ＋ 空 collection の場合は emit しない
  // ==========================================================================
  const latestSpaceUpdate = maxUpdatedAt(spaces);
  const latestNewsUpdate = maxUpdatedAt(news);
  const latestPostUpdate = maxUpdatedAt(posts);
  const latestEventUpdate = maxUpdatedAt(events);

  if (enabled.has("spaces") && latestSpaceUpdate) {
    entries.push({
      url: `${BASE_URL}/spaces`,
      lastModified: latestSpaceUpdate,
    });
  }
  if (enabled.has("news") && latestNewsUpdate) {
    entries.push({ url: `${BASE_URL}/news`, lastModified: latestNewsUpdate });
  }
  if (enabled.has("posts") && latestPostUpdate) {
    entries.push({ url: `${BASE_URL}/blog`, lastModified: latestPostUpdate });
  }
  if (enabled.has("events") && latestEventUpdate) {
    entries.push({
      url: `${BASE_URL}/events`,
      lastModified: latestEventUpdate,
    });
  }

  // ==========================================================================
  // 3-8. 詳細ページ（feature OFF なら丸ごと除外）
  // ==========================================================================
  if (enabled.has("spaces")) {
    for (const space of spaces) {
      entries.push({
        url: `${BASE_URL}/spaces/${encodeURIComponent(space.slug)}`,
        lastModified: space.updatedAt,
      });
    }
  }
  if (enabled.has("news")) {
    for (const item of news) {
      entries.push({
        url: `${BASE_URL}/news/${encodeURIComponent(item.slug)}`,
        lastModified: item.updatedAt,
      });
    }
  }
  if (enabled.has("posts")) {
    for (const post of posts) {
      entries.push({
        url: `${BASE_URL}${encodePath(buildPostCanonicalPath(post))}`,
        lastModified: post.updatedAt,
      });
    }
    for (const category of postCategories) {
      entries.push({
        url: `${BASE_URL}${encodePath(buildCategoryPath(category.slug))}`,
        lastModified: category.updatedAt,
      });
    }
    for (const tag of postTags) {
      entries.push({
        url: `${BASE_URL}${encodePath(buildTagPath(tag.slug))}`,
        lastModified: tag.updatedAt,
      });
    }
  }
  if (enabled.has("events")) {
    // 過去イベントも含める（schema.org/Event の endDate + eventStatus で
    // Google が終了判定するため noindex や sitemap 除外は不要）
    // @see https://developers.google.com/search/docs/appearance/structured-data/event
    for (const event of events) {
      entries.push({
        url: `${BASE_URL}/events/${encodeURIComponent(event.slug)}`,
        lastModified: event.updatedAt,
      });
    }
  }

  // ==========================================================================
  // カスタムページ — feature gate は disabledPageSlugs SSoT に従う
  // ==========================================================================
  for (const page of customPages) {
    if (disabledPageSlugs.has(page.slug)) continue;
    if (isReservedPath(page.slug)) continue; // 過去 data 防御（slug-validation 緩和時の保険）
    entries.push({
      url: `${BASE_URL}/${encodeURIComponent(page.slug)}`,
      lastModified: page.updatedAt,
    });
  }

  // ==========================================================================
  // 規約 — feature gate 対象外（CMS-managed / 法的要件）
  // ==========================================================================
  for (const term of terms) {
    entries.push({
      url: `${BASE_URL}/terms/${encodeURIComponent(term.slug)}`,
      lastModified: term.updatedAt,
    });
  }

  // ==========================================================================
  // 観測ログ — origin DB は s-maxage=3600 の CF キャッシュ越しで ~1/h/PoP のため
  // 1 レンダ = 1 info log で異常検知に十分（GCP Cloud Logging で dashboard 化）
  // ==========================================================================
  logger.info("sitemap rendered", {
    totalEntries: entries.length,
    collections: {
      spaces: spaces.length,
      news: news.length,
      posts: posts.length,
      postCategories: postCategories.length,
      postTags: postTags.length,
      customPages: customPages.length,
      events: events.length,
      terms: terms.length,
      systemPages: systemPageLastModified.size,
    },
    enabledFeatures: [...enabled].sort(),
    durationMs: Date.now() - startedAt,
  });

  // Google 上限（50,000）の 90% 到達で警告
  if (entries.length > 45_000) {
    logger.warn("sitemap entry count approaching Google 50,000 limit", {
      entryCount: entries.length,
    });
  }

  return entries;
}
