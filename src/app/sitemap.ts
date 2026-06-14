/**
 * XMLサイトマップ生成
 *
 * Google公式ガイドラインに準拠:
 * - priority/changefreq は Google が無視するため不使用
 * - lastmod は実際のコンテンツ更新日を使用
 * - 正規化された絶対URLのみ含める
 *
 * @see https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */

import type { MetadataRoute } from "next";
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

// =============================================================================
// Types
// =============================================================================

type SitemapEntry = MetadataRoute.Sitemap[number];

// =============================================================================
// Constants
// =============================================================================

const BASE_URL = getBaseUrl();

/**
 * 静的ページの定義
 *
 * lastModified は設定で管理されないため、
 * ビルド時の日付を使用（実質的に変更頻度が低いページ）
 */
const STATIC_PAGES = [
  "/",
  "/about",
  "/access",
  "/contact",
  "/faq",
  "/reservation",
  "/terms",
] as const;

// =============================================================================
// Sitemap Generation
// =============================================================================

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 全データ / Feature filter を並列取得
  const [content, featureCtx] = await Promise.all([
    getSitemapContentData(),
    getFeatureFilterContext(),
  ]);
  const {
    spaces,
    news,
    posts,
    postCategories,
    postTags,
    customPages,
    events,
    terms,
  } = content;
  const { enabled, disabledRoutes } = featureCtx;

  // 各コンテンツタイプの最新更新日を取得
  const latestSpaceUpdate = spaces[0]?.updatedAt ?? new Date();
  const latestNewsUpdate = news[0]?.updatedAt ?? new Date();
  const latestPostUpdate = posts[0]?.updatedAt ?? new Date();
  const latestEventUpdate = events[0]?.updatedAt ?? new Date();

  const entries: SitemapEntry[] = [];

  // ==========================================================================
  // 1. 静的ページ — disabled feature の publicRoutes を除外
  // ==========================================================================
  for (const path of STATIC_PAGES) {
    if (isUrlDisabled(path, disabledRoutes)) continue;
    entries.push({
      url: `${BASE_URL}${path}`,
      lastModified: new Date(),
    });
  }

  // ==========================================================================
  // 2. 一覧ページ（feature ON のもののみ追加）
  // ==========================================================================
  if (enabled.has("spaces")) {
    entries.push({
      url: `${BASE_URL}/spaces`,
      lastModified: latestSpaceUpdate,
    });
  }
  if (enabled.has("news")) {
    entries.push({ url: `${BASE_URL}/news`, lastModified: latestNewsUpdate });
  }
  if (enabled.has("posts")) {
    entries.push({ url: `${BASE_URL}/blog`, lastModified: latestPostUpdate });
  }
  if (enabled.has("events")) {
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
        url: `${BASE_URL}/spaces/${space.slug}`,
        lastModified: space.updatedAt,
      });
    }
  }
  if (enabled.has("news")) {
    for (const item of news) {
      entries.push({
        url: `${BASE_URL}/news/${item.slug}`,
        lastModified: item.updatedAt,
      });
    }
  }
  if (enabled.has("posts")) {
    for (const post of posts) {
      entries.push({
        url: `${BASE_URL}${buildPostCanonicalPath(post)}`,
        lastModified: post.updatedAt,
      });
    }
    for (const category of postCategories) {
      entries.push({
        url: `${BASE_URL}${buildCategoryPath(category.slug)}`,
        lastModified: category.updatedAt,
      });
    }
    for (const tag of postTags) {
      entries.push({
        url: `${BASE_URL}${buildTagPath(tag.slug)}`,
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
        url: `${BASE_URL}/events/${event.slug}`,
        lastModified: event.updatedAt,
      });
    }
  }

  // ==========================================================================
  // カスタムページ / 規約 — feature gate 対象外（CMS-managed / 法的要件）
  // ==========================================================================
  for (const page of customPages) {
    entries.push({
      url: `${BASE_URL}/${page.slug}`,
      lastModified: page.updatedAt,
    });
  }
  for (const term of terms) {
    entries.push({
      url: `${BASE_URL}/terms/${term.slug}`,
      lastModified: term.updatedAt,
    });
  }

  return entries;
}
