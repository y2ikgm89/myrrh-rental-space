/**
 * 投稿URL生成ユーティリティ
 *
 * パーマリンク設定に基づいて投稿記事のURLを生成します。
 * postUrlPrefixEnabled 設定により、/posts/ プレフィックスの有無を制御します。
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
  /** プレフィックス（'/posts' または ''） */
  prefix?: string;
}

// =============================================================================
// URL Generation
// =============================================================================

/**
 * 投稿記事のURLを生成
 *
 * @param post - 記事データ
 * @param config - パーマリンク設定
 * @returns 生成されたURL（先頭に/を含む相対パス）
 *
 * @example
 * ```ts
 * // プレフィックス有効 + post_name: /posts/article-title
 * generatePostUrl(post, { structure: 'post_name', prefix: '/posts' })
 *
 * // プレフィックス無効 + post_name: /article-title
 * generatePostUrl(post, { structure: 'post_name', prefix: '' })
 *
 * // プレフィックス有効 + date_name: /posts/2026/01/article-title
 * generatePostUrl(post, { structure: 'date_name', prefix: '/posts' })
 *
 * // プレフィックス有効 + category_name: /posts/category-slug/article-title
 * generatePostUrl(post, { structure: 'category_name', prefix: '/posts' })
 * ```
 */
export function generatePostUrl(
  post: PostUrlData,
  config: PermalinkConfig,
): string {
  const { slug, publishedAt, category } = post;
  const { structure, prefix = "/posts" } = config;

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

  return `${prefix}${path}`;
}
