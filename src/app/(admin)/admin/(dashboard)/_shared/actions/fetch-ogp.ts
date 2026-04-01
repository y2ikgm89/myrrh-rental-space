"use server";

import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { isUrlSafe } from "@/admin/lib/ssrf-guard";
import {
  extractTitle,
  extractDescription,
  extractImage,
  extractSiteName,
  getFaviconUrl,
  resolveUrl,
} from "@/admin/lib/ogp-parser";

// =============================================================================
// Types
// =============================================================================

export type OgpData = {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string;
  siteName: string | null;
};

// =============================================================================
// Schema
// =============================================================================

const urlSchema = z.string().url({ error: "有効なURLを入力してください" });

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
  // バリデーション
  const validated = urlSchema.safeParse(url);
  if (!validated.success) {
    return { error: "有効なURLを入力してください" };
  }

  // SSRF対策: URLの安全性を検証
  if (!isUrlSafe(url)) {
    return { error: "無効なURLです" };
  }

  return executeAdminMutationResult({
    resource: "media",
    action: "read",
    execute: async () => {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BookmarkBot/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`URLの取得に失敗しました: ${response.status}`);
      }

      const html = await response.text();
      const imageRaw = extractImage(html);

      return {
        url,
        title: extractTitle(html),
        description: extractDescription(html),
        imageUrl: imageRaw ? resolveUrl(url, imageRaw) : null,
        faviconUrl: getFaviconUrl(url, html),
        siteName: extractSiteName(html),
      };
    },
  });
}
