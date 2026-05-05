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
import { buildPostCanonicalPath } from "@/shared/domain/posts/routing";
import { getPermalinkSettings } from "@/shared/domain/settings/queries/display";

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
  "/contact",
  "/faq",
  "/reservation",
  "/terms",
] as const;

// =============================================================================
// Sitemap Generation
// =============================================================================

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 設定と全データを並列取得
  const [permalinkSettings, content] = await Promise.all([
    getPermalinkSettings(),
    getSitemapContentData(),
  ]);
  const { spaces, news, posts, customPages, events, terms } = content;

  // 各コンテンツタイプの最新更新日を取得
  const latestSpaceUpdate = spaces[0]?.updatedAt ?? new Date();
  const latestNewsUpdate = news[0]?.updatedAt ?? new Date();
  const latestPostUpdate = posts[0]?.updatedAt ?? new Date();
  const latestEventUpdate = events[0]?.updatedAt ?? new Date();

  const entries: SitemapEntry[] = [];

  // ==========================================================================
  // 1. 静的ページ
  // ==========================================================================
  for (const path of STATIC_PAGES) {
    entries.push({
      url: `${BASE_URL}${path}`,
      lastModified: new Date(),
    });
  }

  // ==========================================================================
  // 2. 一覧ページ（各コンテンツの最新更新日を使用）
  // ==========================================================================
  entries.push({
    url: `${BASE_URL}/spaces`,
    lastModified: latestSpaceUpdate,
  });
  entries.push({
    url: `${BASE_URL}/news`,
    lastModified: latestNewsUpdate,
  });
  entries.push({
    url: `${BASE_URL}/posts`,
    lastModified: latestPostUpdate,
  });
  entries.push({
    url: `${BASE_URL}/events`,
    lastModified: latestEventUpdate,
  });

  // ==========================================================================
  // 3. スペース詳細ページ
  // ==========================================================================
  for (const space of spaces) {
    entries.push({
      url: `${BASE_URL}/spaces/${space.slug}`,
      lastModified: space.updatedAt,
    });
  }

  // ==========================================================================
  // 4. お知らせ詳細ページ
  // ==========================================================================
  for (const item of news) {
    entries.push({
      url: `${BASE_URL}/news/${item.slug}`,
      lastModified: item.updatedAt,
    });
  }

  // ==========================================================================
  // 5. 投稿詳細ページ
  // ==========================================================================
  for (const post of posts) {
    entries.push({
      url: `${BASE_URL}${buildPostCanonicalPath(post, permalinkSettings ?? undefined)}`,
      lastModified: post.updatedAt,
    });
  }

  // ==========================================================================
  // 6. カスタムページ
  // ==========================================================================
  for (const page of customPages) {
    entries.push({
      url: `${BASE_URL}/${page.slug}`,
      lastModified: page.updatedAt,
    });
  }

  // ==========================================================================
  // 7. 規約詳細ページ
  // ==========================================================================
  for (const term of terms) {
    entries.push({
      url: `${BASE_URL}/terms/${term.slug}`,
      lastModified: term.updatedAt,
    });
  }

  // ==========================================================================
  // 8. イベント詳細ページ
  // 過去イベントも含める（schema.org/Event の endDate + eventStatus で
  // Google が終了判定するため noindex や sitemap 除外は不要）
  // @see https://developers.google.com/search/docs/appearance/structured-data/event
  // ==========================================================================
  for (const event of events) {
    entries.push({
      url: `${BASE_URL}/events/${event.slug}`,
      lastModified: event.updatedAt,
    });
  }

  return entries;
}
