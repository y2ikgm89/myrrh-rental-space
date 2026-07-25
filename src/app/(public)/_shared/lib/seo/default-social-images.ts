import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE_SIZE } from "@/public/lib/seo/default-brand-og-image";

/**
 * 既定 OG / Twitter 画像の URL と alt 解決。
 *
 * Next.js 公式の二経路:
 * 1. file convention (`opengraph-image.tsx` + `export const alt`) — alt は静的
 * 2. Metadata API の `openGraph.images` / `twitter.images`（`alt` 付き）+
 *    `ImageResponse` を返す Route Handler（`/opengraph-image`, `/twitter-image`）
 *
 * Settings 駆動の動的 alt（siteName）と PPR（`connection()` を metadata 画像層に
 * 置かない）のため 2 を採用。`icon` / `apple-icon` と同型。file convention への
 * 互換シムは置かない。
 *
 * @see https://nextjs.org/docs/app/api-reference/functions/image-response
 * @see https://nextjs.org/docs/app/api-reference/functions/generate-metadata
 */
export const DEFAULT_OG_IMAGE_PATH = "/opengraph-image";
export const DEFAULT_TWITTER_IMAGE_PATH = "/twitter-image";

export function resolveOpenGraphImages(
  siteName: string,
  customImageUrl?: string | null,
  customAlt?: string,
): NonNullable<NonNullable<Metadata["openGraph"]>["images"]> {
  if (customImageUrl) {
    return [{ url: customImageUrl, alt: customAlt ?? siteName }];
  }
  return [
    {
      url: DEFAULT_OG_IMAGE_PATH,
      width: DEFAULT_OG_IMAGE_SIZE.width,
      height: DEFAULT_OG_IMAGE_SIZE.height,
      alt: siteName,
    },
  ];
}

export function resolveTwitterImages(
  siteName: string,
  customImageUrl?: string | null,
): NonNullable<NonNullable<Metadata["twitter"]>["images"]> {
  if (customImageUrl) {
    return [customImageUrl];
  }
  return [{ url: DEFAULT_TWITTER_IMAGE_PATH, alt: siteName }];
}
