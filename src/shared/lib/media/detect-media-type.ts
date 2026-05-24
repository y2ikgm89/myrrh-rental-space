/**
 * Media URL → "image" | "video" 判別 SSoT
 *
 * 業界 reference: WordPress Cover Block の `mediaType` 派生ロジック / Sanity Studio
 * `_type` discriminator / Contentful / Strapi の MIME ベース dispatch と整合。
 *
 * セクション schema (hero / page-hero) の単一 media field (`accept: "image-or-video"`)
 * から runtime に image / video を分岐し、`<Image>` / `<VideoPlayer>` 出し分けに使う。
 *
 * 判定優先順位:
 *   1. YouTube / Vimeo URL pattern → video（埋込み iframe で render）
 *   2. 拡張子 (`.mp4` / `.webm` / `.mov`) → video
 *   3. それ以外 → image（既知の画像拡張子 + R2 image / 外部 CDN すべてフォールバック）
 *
 * 純粋関数（client / server 両用）。`server-only` import を避けるため `r2/media-magic-bytes`
 * の constants は再利用せず、独立した拡張子リストを保持する。
 */

import { detectVideoProvider } from "@/shared/lib/video/url-detect";

export type DetectedMediaType = "image" | "video";

/** 動画拡張子（小文字、ドットあり） */
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v"] as const;

/**
 * URL から image / video を派生する。
 *
 * @param url      検査対象 URL（空文字列は "image" を返す — UI 側で `.length > 0` gate 済）
 * @param options.r2PublicUrl R2 public URL prefix（YouTube/Vimeo 判定後の拡張子 fallback で使用）
 */
export function detectMediaSourceType(
  url: string,
  options: { r2PublicUrl?: string } = {},
): DetectedMediaType {
  if (url.length === 0) return "image";

  // 1. YouTube / Vimeo は確実に video
  const { provider } = detectVideoProvider(url, options.r2PublicUrl);
  if (provider !== undefined) return "video";

  // 2. 拡張子で video 判定（query string / fragment を除外）
  const path = stripQueryAndFragment(url).toLowerCase();
  if (VIDEO_EXTENSIONS.some((ext) => path.endsWith(ext))) return "video";

  // 3. それ以外は image（jpg/png/webp/gif + 外部 CDN URL の汎用フォールバック）
  return "image";
}

function stripQueryAndFragment(url: string): string {
  const queryIndex = url.indexOf("?");
  const fragmentIndex = url.indexOf("#");
  const cutoff =
    queryIndex >= 0 && fragmentIndex >= 0
      ? Math.min(queryIndex, fragmentIndex)
      : queryIndex >= 0
        ? queryIndex
        : fragmentIndex >= 0
          ? fragmentIndex
          : -1;
  return cutoff >= 0 ? url.slice(0, cutoff) : url;
}
