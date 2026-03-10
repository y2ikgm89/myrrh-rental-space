"use server";

import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import type { MutationResult } from "@/shared/lib/mutation-result";

// =============================================================================
// Types
// =============================================================================

export type OgpData = {
  url: string;
  title: string;
  description: string;
  imageUrl: string;
  faviconUrl: string;
  siteName: string;
};

// =============================================================================
// Schema
// =============================================================================

const urlSchema = z.string().url({ error: "有効なURLを入力してください" });

// =============================================================================
// SSRF Protection
// =============================================================================

/**
 * プライベートIPアドレスかどうかをチェック
 * SSRF脆弱性対策として、内部ネットワークへのリクエストを禁止
 */
function isPrivateOrReservedHost(hostname: string): boolean {
  // localhost
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  ) {
    return true;
  }

  // IPv4のプライベートアドレス範囲をチェック
  const ipv4Match = hostname.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  );
  if (ipv4Match) {
    const [, a, b, c, d] = ipv4Match.map(Number);
    if (
      a === undefined ||
      b === undefined ||
      c === undefined ||
      d === undefined
    )
      return false;
    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return true;
    // 127.0.0.0/8 (loopback)
    if (a === 127) return true;
    // 0.0.0.0/8
    if (a === 0) return true;
    // 100.64.0.0/10 (carrier-grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 198.18.0.0/15 (benchmark testing)
    if (a === 198 && (b === 18 || b === 19)) return true;
    // マルチキャスト 224.0.0.0/4
    if (a >= 224 && a <= 239) return true;
    // ブロードキャスト
    if (a === 255 && b === 255 && c === 255 && d === 255) return true;
  }

  // IPv6のプライベート/予約アドレス
  if (hostname.startsWith("[")) {
    const ipv6 = hostname.slice(1, -1).toLowerCase();
    // ::1 (loopback)
    if (ipv6 === "::1") return true;
    // fc00::/7 (unique local)
    if (ipv6.startsWith("fc") || ipv6.startsWith("fd")) return true;
    // fe80::/10 (link-local)
    if (ipv6.startsWith("fe80")) return true;
    // :: (unspecified)
    if (ipv6 === "::") return true;
  }

  // 一般的な内部ホスト名パターン
  const internalPatterns = [
    /^localhost$/i,
    /^.*\.local$/i,
    /^.*\.internal$/i,
    /^.*\.localdomain$/i,
    /^.*\.localhost$/i,
    /^kubernetes\.default/i,
    /^metadata\.google\.internal/i,
    /^169\.254\.169\.254/, // AWS/GCP metadata
  ];

  return internalPatterns.some((pattern) => pattern.test(hostname));
}

/**
 * URLが安全かどうかを検証
 */
function isUrlSafe(urlString: string): { safe: boolean; error?: string } {
  try {
    const url = new URL(urlString);

    // HTTPとHTTPSのみ許可
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { safe: false, error: "HTTP/HTTPSのURLのみ許可されています" };
    }

    // プライベート/予約アドレスへのアクセスを禁止
    if (isPrivateOrReservedHost(url.hostname)) {
      return {
        safe: false,
        error: "プライベートネットワークへのアクセスは許可されていません",
      };
    }

    // ポート番号のチェック（標準ポート以外は警戒）
    const port = url.port
      ? parseInt(url.port, 10)
      : url.protocol === "https:"
        ? 443
        : 80;
    if (port !== 80 && port !== 443 && port !== 8080 && port !== 8443) {
      return {
        safe: false,
        error: "非標準ポートへのアクセスは許可されていません",
      };
    }

    return { safe: true };
  } catch {
    return { safe: false, error: "無効なURLです" };
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function extractMetaContent(html: string, property: string): string {
  // og:property or name attribute
  const ogRegex = new RegExp(
    `<meta[^>]*(?:property|name)=["']${RegExp.escape(property)}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const ogMatch = html.match(ogRegex);
  if (ogMatch?.[1]) return ogMatch[1];

  // content first pattern
  const contentFirstRegex = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${RegExp.escape(property)}["']`,
    "i",
  );
  const contentFirstMatch = html.match(contentFirstRegex);
  if (contentFirstMatch?.[1]) return contentFirstMatch[1];

  return "";
}

function extractTitle(html: string): string {
  // og:title
  const ogTitle = extractMetaContent(html, "og:title");
  if (ogTitle) return ogTitle;

  // twitter:title
  const twitterTitle = extractMetaContent(html, "twitter:title");
  if (twitterTitle) return twitterTitle;

  // <title> tag
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch?.[1]) return titleMatch[1].trim();

  return "";
}

function extractDescription(html: string): string {
  // og:description
  const ogDesc = extractMetaContent(html, "og:description");
  if (ogDesc) return ogDesc;

  // twitter:description
  const twitterDesc = extractMetaContent(html, "twitter:description");
  if (twitterDesc) return twitterDesc;

  // meta description
  const metaDesc = extractMetaContent(html, "description");
  if (metaDesc) return metaDesc;

  return "";
}

function extractImage(html: string): string {
  // og:image
  const ogImage = extractMetaContent(html, "og:image");
  if (ogImage) return ogImage;

  // twitter:image
  const twitterImage = extractMetaContent(html, "twitter:image");
  if (twitterImage) return twitterImage;

  return "";
}

function extractSiteName(html: string): string {
  // og:site_name
  const ogSiteName = extractMetaContent(html, "og:site_name");
  if (ogSiteName) return ogSiteName;

  // application-name
  const appName = extractMetaContent(html, "application-name");
  if (appName) return appName;

  return "";
}

function getFaviconUrl(baseUrl: string, html: string): string {
  const url = new URL(baseUrl);

  // Extract from link tags
  // icon
  const iconRegex =
    /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']*)["']/i;
  const iconMatch = html.match(iconRegex);
  if (iconMatch?.[1]) {
    const href = iconMatch[1];
    if (href.startsWith("http")) return href;
    if (href.startsWith("//")) return `${url.protocol}${href}`;
    if (href.startsWith("/")) return `${url.origin}${href}`;
    return `${url.origin}/${href}`;
  }

  // href first pattern
  const hrefFirstRegex =
    /<link[^>]*href=["']([^"']*)["'][^>]*rel=["'](?:shortcut )?icon["']/i;
  const hrefFirstMatch = html.match(hrefFirstRegex);
  if (hrefFirstMatch?.[1]) {
    const href = hrefFirstMatch[1];
    if (href.startsWith("http")) return href;
    if (href.startsWith("//")) return `${url.protocol}${href}`;
    if (href.startsWith("/")) return `${url.origin}${href}`;
    return `${url.origin}/${href}`;
  }

  // Default favicon path
  return `${url.origin}/favicon.ico`;
}

function resolveUrl(baseUrl: string, relativeUrl: string): string {
  if (!relativeUrl) return "";
  if (relativeUrl.startsWith("http")) return relativeUrl;

  const url = new URL(baseUrl);
  if (relativeUrl.startsWith("//")) return `${url.protocol}${relativeUrl}`;
  if (relativeUrl.startsWith("/")) return `${url.origin}${relativeUrl}`;
  return `${url.origin}/${relativeUrl}`;
}

// =============================================================================
// Server Action
// =============================================================================

/**
 * URLからOGP情報を取得する
 *
 * @param url - 取得対象のURL
 * @returns OGP情報またはエラー
 */
export async function fetchOgp(url: string): Promise<MutationResult<OgpData>> {
  const auth = await checkPermission("media", "read");
  if (!auth.success) {
    return auth.error;
  }

  // バリデーション
  const validated = urlSchema.safeParse(url);
  if (!validated.success) {
    return { error: "有効なURLを入力してください" };
  }

  // SSRF対策: URLの安全性を検証
  const safetyCheck = isUrlSafe(url);
  if (!safetyCheck.safe) {
    return { error: safetyCheck.error ?? "URLの検証に失敗しました" };
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BookmarkBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { error: `URLの取得に失敗しました: ${response.status}` };
    }

    const html = await response.text();

    const title = extractTitle(html);
    const description = extractDescription(html);
    const imageUrlRaw = extractImage(html);
    const imageUrl = resolveUrl(url, imageUrlRaw);
    const faviconUrl = getFaviconUrl(url, html);
    const siteName = extractSiteName(html);

    return {
      url,
      title,
      description,
      imageUrl,
      faviconUrl,
      siteName,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { error: "URLの取得がタイムアウトしました" };
    }
    return { error: "URLの取得に失敗しました" };
  }
}
