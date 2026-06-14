/**
 * 投稿URL生成ユーティリティ
 *
 * 投稿記事の正規URL（`/blog/{slug}` 固定）を生成します。
 *
 * 記事ルートは単一動的セグメント `/blog/[slug]` のみで、多セグメント permalink
 * （`/blog/yyyy/mm/slug` 等）を受ける catch-all ルートは存在しません。そのため
 * `postPermalinkStructure` の値に依らず、ルータブルな唯一の形 `/blog/{slug}` を返します
 * （設定・enum・カラムの撤去はスキーマ migration を伴うため別対応）。
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
 * 投稿記事のURLを生成する。
 *
 * 記事詳細ルートは `/blog/[slug]`（単一動的セグメント）のみのため、構造設定に依らず
 * 常に `/blog/{slug}` を返す。多セグメント permalink を生成すると catch-all 不在で
 * 記事カード・サイドバー・関連記事・sitemap が一斉に 404 になるため、ここで一元的に
 * ルータブルな形へ正規化する。
 *
 * @param post - 記事データ
 * @param _config - パーマリンク設定（現在の routing では未使用。後方互換のため受け取る）
 * @returns 生成されたURL（`/blog/{slug}`）
 */
export function generatePostUrl(
  post: PostUrlData,
  _config: PermalinkConfig,
): string {
  return `${POST_URL_PREFIX}/${post.slug}`;
}
