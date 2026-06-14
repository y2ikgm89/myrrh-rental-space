/**
 * 投稿URL生成ユーティリティ
 *
 * 投稿記事の正規URL（`/blog` 配下）を生成します。
 * URL 構造（シンプル / 日付+記事名 / カテゴリ+記事名）は
 * postPermalinkStructure 設定で切り替わります。
 *
 * @module shared/lib/url/post-url
 */

import { PostPermalinkStructure } from "@/shared/lib/validations/enums/prisma-types";

// =============================================================================
// Types
// =============================================================================

/** URL生成に必要な記事データ */
export interface PostUrlData {
  slug: string;
  publishedAt?: Date | string | null;
  category?: {
    slug: string;
  } | null;
}

/** パーマリンク設定 */
export interface PermalinkConfig {
  structure: PostPermalinkStructure;
}

// =============================================================================
// URL Generation
// =============================================================================

/**
 * 記事URLの base prefix。
 *
 * 記事一覧・詳細は `/blog` 配下に固定（ブログ URL 統一の確定仕様）。
 * URL 構造（日付・カテゴリ階層）は `PostPermalinkStructure` で切り替わるが、
 * base prefix は設定に依存しない。
 */
const POST_URL_PREFIX = "/blog";

/**
 * 投稿記事のURLを生成
 *
 * @param post - 記事データ
 * @param config - パーマリンク設定
 * @returns 生成されたURL（先頭に/を含む相対パス）
 *
 * @example
 * ```ts
 * // post_name: /blog/article-title
 * generatePostUrl(post, { structure: 'post_name' })
 *
 * // date_name: /blog/2026/01/article-title
 * generatePostUrl(post, { structure: 'date_name' })
 *
 * // category_name: /blog/category-slug/article-title
 * generatePostUrl(post, { structure: 'category_name' })
 * ```
 */
export function generatePostUrl(
  post: PostUrlData,
  config: PermalinkConfig,
): string {
  const { slug, publishedAt, category } = post;
  const { structure } = config;

  let path: string;
  switch (structure) {
    case PostPermalinkStructure.date_name: {
      // /2026/01/article-title
      const date = publishedAt ? new Date(publishedAt) : new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      path = `/${year}/${month}/${slug}`;
      break;
    }

    case PostPermalinkStructure.category_name: {
      // /category-slug/article-title
      const categorySlug = category?.slug ?? "uncategorized";
      path = `/${categorySlug}/${slug}`;
      break;
    }

    case PostPermalinkStructure.post_name:
    default:
      // /article-title
      path = `/${slug}`;
  }

  return `${POST_URL_PREFIX}${path}`;
}
