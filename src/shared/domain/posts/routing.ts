import { generatePostUrl, type PostUrlData } from "@/shared/lib/url";

const RESERVED_POST_SEGMENTS = new Set([
  "about",
  "contact",
  "faq",
  "news",
  "reservation",
  "spaces",
  "terms",
  "privacy",
  "blog",
  "p",
  "admin",
  "api",
  "_next",
  "category",
  "tag",
  "preview",
]);

export function isReservedPostSegment(segment: string): boolean {
  return RESERVED_POST_SEGMENTS.has(segment.toLowerCase());
}

export function buildPostCanonicalPath(post: PostUrlData): string {
  return generatePostUrl(post);
}

/**
 * カテゴリ別アーカイブの正規パス。
 *
 * 記事詳細が `/blog/{slug}` 固定なのに対し、分類アーカイブはトップレベルの
 * `/category/{slug}` に置く（`RESERVED_POST_SEGMENTS` で予約済み）。
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
