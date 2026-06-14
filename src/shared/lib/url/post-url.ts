/**
 * 投稿URL生成ユーティリティ
 *
 * 投稿記事の正規URL（`/blog/{slug}` 固定）を生成します。
 *
 * 記事ルートは単一動的セグメント `/blog/[slug]` のみで、多セグメント permalink
 * （`/blog/yyyy/mm/slug` 等）を受ける catch-all ルートは存在しません。そのため
 * ルータブルな唯一の形 `/blog/{slug}` を返します。
 *
 * @module shared/lib/url/post-url
 */

// =============================================================================
// Types
// =============================================================================

/**
 * URL生成に必要な記事データ。
 *
 * URL 自体は `slug` のみで決まるが、呼び出し側が post 形状のオブジェクトを
 * そのまま渡せるよう `publishedAt` / `category` も受け取る（生成では未使用）。
 */
export interface PostUrlData {
  slug: string;
  publishedAt?: Date | string | null;
  category?: {
    slug: string;
  } | null;
}

// =============================================================================
// URL Generation
// =============================================================================

/**
 * 記事URLの base prefix。
 *
 * 記事一覧・詳細は `/blog` 配下に固定（ブログ URL 統一の確定仕様）。
 */
const POST_URL_PREFIX = "/blog";

/**
 * 投稿記事のURLを生成する。
 *
 * 記事詳細ルートは `/blog/[slug]`（単一動的セグメント）のみのため、常に
 * `/blog/{slug}` を返す。多セグメント URL を返すと catch-all 不在で記事カード・
 * サイドバー・関連記事・sitemap が一斉に 404 になるため、ここでルータブルな形に
 * 一元化する。
 *
 * @param post - 記事データ
 * @returns 生成されたURL（`/blog/{slug}`）
 */
export function generatePostUrl(post: PostUrlData): string {
  return `${POST_URL_PREFIX}/${post.slug}`;
}
