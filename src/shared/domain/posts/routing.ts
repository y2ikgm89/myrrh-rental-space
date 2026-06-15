import { generatePostUrl, type PostUrlData } from "@/shared/lib/url";

export function buildPostCanonicalPath(post: PostUrlData): string {
  return generatePostUrl(post);
}

/**
 * カテゴリ別アーカイブの正規パス。
 *
 * 記事詳細が `/blog/{slug}` 固定なのに対し、分類アーカイブはトップレベルの
 * `/category/{slug}` に置く（予約スラッグの SSoT は slug-validation.ts の
 * `RESERVED_PATHS`）。
 */
export function buildCategoryPath(slug: string): string {
  return `/category/${slug}`;
}

/**
 * タグ別アーカイブの正規パス（トップレベル `/tag/{slug}`）。
 */
export function buildTagPath(slug: string): string {
  return `/tag/${slug}`;
}
