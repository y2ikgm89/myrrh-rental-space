import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminAuth } from "@/admin/lib/action-auth";
import { isUrlSafe } from "@/admin/lib/ssrf-guard";
import {
  extractTitle,
  extractDescription,
  extractImage,
  extractSiteName,
  getFaviconUrl,
  resolveUrl,
} from "@/admin/lib/ogp-parser";
import { jsonError, jsonValidationError } from "@/shared/lib/route-responses";

const requestSchema = z.object({
  url: z.string().url({ error: "有効なURLを入力してください" }),
});

type OgpData = {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string;
  siteName: string | null;
};

export async function POST(request: Request) {
  const auth = await checkAdminAuth(request.headers);
  if (!auth.success) {
    return jsonError(auth.error.error, 401);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonValidationError(parsed.error, "入力内容が不正です");
  }

  const { url } = parsed.data;
  if (!isUrlSafe(url)) {
    return jsonError("無効なURLです");
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
      return jsonError(`URLの取得に失敗しました: ${response.status}`);
    }

    const html = await response.text();
    const imageRaw = extractImage(html);

    const ogpData: OgpData = {
      url,
      title: extractTitle(html),
      description: extractDescription(html),
      imageUrl: imageRaw ? resolveUrl(url, imageRaw) : null,
      faviconUrl: getFaviconUrl(url, html),
      siteName: extractSiteName(html),
    };

    return NextResponse.json(ogpData);
  } catch {
    return jsonError("OGP の取得に失敗しました", 502);
  }
}
