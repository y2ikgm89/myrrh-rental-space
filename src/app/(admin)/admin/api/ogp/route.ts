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

const OGP_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; BookmarkBot/1.0)",
  Accept: "text/html,application/xhtml+xml",
} satisfies HeadersInit;

const MAX_OGP_REDIRECTS = 3;

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

class OgpFetchError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "OgpFetchError";
    this.status = status;
  }
}

function isRedirectStatus(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}

function resolveRedirectTarget(currentUrl: string, location: string | null) {
  if (!location) return null;

  try {
    return new URL(location, currentUrl).toString();
  } catch {
    return null;
  }
}

async function fetchOgpPage(
  initialUrl: string,
): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = initialUrl;
  let redirectCount = 0;

  while (true) {
    if (!(await isUrlSafe(currentUrl))) {
      throw new OgpFetchError(
        redirectCount === 0 ? "無効なURLです" : "無効なリダイレクト先です",
        400,
      );
    }

    const response = await fetch(currentUrl, {
      headers: OGP_FETCH_HEADERS,
      signal: AbortSignal.timeout(10000),
      redirect: "manual",
    });

    if (!isRedirectStatus(response.status)) {
      return { response, finalUrl: currentUrl };
    }

    if (redirectCount >= MAX_OGP_REDIRECTS) {
      throw new OgpFetchError("リダイレクト回数が上限を超えました", 400);
    }

    const redirectUrl = resolveRedirectTarget(
      currentUrl,
      response.headers.get("location"),
    );
    if (!redirectUrl) {
      throw new OgpFetchError("無効なリダイレクトです", 400);
    }

    redirectCount += 1;
    currentUrl = redirectUrl;
  }
}

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

  try {
    const { response, finalUrl } = await fetchOgpPage(url);

    if (!response.ok) {
      return jsonError(`URLの取得に失敗しました: ${response.status}`);
    }

    const html = await response.text();
    const imageRaw = extractImage(html);

    const ogpData: OgpData = {
      url: finalUrl,
      title: extractTitle(html),
      description: extractDescription(html),
      imageUrl: imageRaw ? resolveUrl(finalUrl, imageRaw) : null,
      faviconUrl: getFaviconUrl(finalUrl, html),
      siteName: extractSiteName(html),
    };

    return NextResponse.json(ogpData);
  } catch (error) {
    if (error instanceof OgpFetchError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("OGP の取得に失敗しました", 502);
  }
}
