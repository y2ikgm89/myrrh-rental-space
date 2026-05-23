/**
 * Video URL detection SSoT — 純粋関数（client-safe / server-safe 両用）
 *
 * 動画 URL の文字列パターンから provider (YouTube / Vimeo) と source (R2 / external) を派生する。
 * VideoPlayer Primitive / MediaPreview / oEmbed client が共通で利用する canonical 判定ロジック。
 *
 * 業界標準: WordPress Video Block / Webflow / Squarespace / Sanity Studio 公式 oEmbed 仕様準拠。
 */

export type VideoProvider = "youtube" | "vimeo";
export type VideoSource = "r2" | "external";

export interface VideoDetection {
  readonly source: VideoSource;
  readonly provider?: VideoProvider;
  readonly videoId?: string;
  readonly embedUrl?: string;
}

/**
 * YouTube URL pattern:
 * - https://www.youtube.com/watch?v=<id>
 * - https://youtube.com/watch?v=<id>
 * - https://www.youtube.com/embed/<id>
 * - https://youtu.be/<id>
 * - https://www.youtube.com/shorts/<id>
 */
const YOUTUBE_PATTERN =
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]+)/;

/**
 * Vimeo URL pattern:
 * - https://vimeo.com/<id>
 * - https://player.vimeo.com/video/<id>
 */
const VIMEO_PATTERN = /vimeo\.com\/(?:video\/)?(\d+)/;

/**
 * 動画 URL から source / provider / videoId / embedUrl を派生する。
 *
 * @param url - 検査対象の URL（空文字列でも安全に呼べる）
 * @param r2PublicUrl - R2 publicUrl prefix（未指定なら R2 判定を skip）
 */
export function detectVideoProvider(
  url: string,
  r2PublicUrl?: string,
): VideoDetection {
  if (url.length === 0) {
    return { source: "external" };
  }

  const youtubeMatch = YOUTUBE_PATTERN.exec(url);
  if (youtubeMatch && youtubeMatch[1]) {
    const videoId = youtubeMatch[1];
    return {
      source: "external",
      provider: "youtube",
      videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
    };
  }

  const vimeoMatch = VIMEO_PATTERN.exec(url);
  if (vimeoMatch && vimeoMatch[1]) {
    const videoId = vimeoMatch[1];
    return {
      source: "external",
      provider: "vimeo",
      videoId,
      embedUrl: `https://player.vimeo.com/video/${videoId}`,
    };
  }

  // R2 self-host detection (publicUrl prefix match)
  if (r2PublicUrl && r2PublicUrl.length > 0 && url.startsWith(r2PublicUrl)) {
    return { source: "r2" };
  }

  return { source: "external" };
}

/**
 * URL が iframe 埋め込み (YouTube / Vimeo) として render すべきかを判定。
 */
export function isEmbeddableVideoUrl(url: string): boolean {
  const { provider } = detectVideoProvider(url);
  return provider !== undefined;
}
