import "server-only";

/**
 * YouTube / Vimeo oEmbed client — admin プレビュー時の thumbnail / title 取得 SSoT
 *
 * 公開側 VideoPlayer は iframe を直接 embed するため oEmbed 不要（Cloudflare CDN 透過）。
 * admin プレビューでサムネ・タイトルを表示する用途のみで使用。
 *
 * SSRF guard 必須:
 * - 構築済 oEmbed endpoint (youtube.com / vimeo.com) も `isUrlSafe()` を通過させる
 * - DNS rebinding 攻撃 / typo squat の防御層として保持
 *
 * 業界標準: [oEmbed 仕様](https://oembed.com/) / YouTube oEmbed / Vimeo oEmbed 公式 endpoint。
 */

import { isUrlSafe } from "@/shared/lib/ssrf-guard";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { detectVideoProvider } from "./url-detect";

const OEMBED_TIMEOUT_MS = 5000;

const YOUTUBE_OEMBED_ENDPOINT = "https://www.youtube.com/oembed";
const VIMEO_OEMBED_ENDPOINT = "https://vimeo.com/api/oembed.json";

export interface VideoOembedData {
  readonly title: string;
  readonly thumbnailUrl: string;
  readonly providerName: string;
  readonly authorName?: string;
}

interface YouTubeOembedResponse {
  readonly title?: unknown;
  readonly thumbnail_url?: unknown;
  readonly author_name?: unknown;
}

interface VimeoOembedResponse {
  readonly title?: unknown;
  readonly thumbnail_url?: unknown;
  readonly author_name?: unknown;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * 動画 URL から oEmbed メタデータ (title / thumbnail) を取得する。
 * 取得失敗時は null を返し UI 側でフォールバック描画する。
 */
export async function fetchVideoOembed(
  url: string,
): Promise<VideoOembedData | null> {
  const detection = detectVideoProvider(url);
  if (!detection.provider) return null;

  const endpoint =
    detection.provider === "youtube"
      ? `${YOUTUBE_OEMBED_ENDPOINT}?url=${encodeURIComponent(url)}&format=json`
      : `${VIMEO_OEMBED_ENDPOINT}?url=${encodeURIComponent(url)}`;

  if (!(await isUrlSafe(endpoint))) {
    logError(new Error("oEmbed endpoint failed SSRF guard"), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "fetchVideoOembed", provider: detection.provider },
    });
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as
      | YouTubeOembedResponse
      | VimeoOembedResponse;

    const title = asString(data.title);
    const thumbnailUrl = asString(data.thumbnail_url);
    if (!title || !thumbnailUrl) return null;

    const authorName = asString(data.author_name);
    return {
      title,
      thumbnailUrl,
      providerName: detection.provider === "youtube" ? "YouTube" : "Vimeo",
      ...(authorName !== undefined && { authorName }),
    };
  } catch (error) {
    logError(error, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: { operation: "fetchVideoOembed", provider: detection.provider },
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
