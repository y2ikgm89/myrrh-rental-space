import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminAuth } from "@/admin/lib/action-auth";
import { fetchPublicHttpResource } from "@/shared/lib/ssrf-guard";
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

// OGP メタタグは <head> 内にあるため 2MB あれば十分。content-length を信用せず
// ストリーム読み取り中も上限を強制し、悪意あるリダイレクト先が巨大ボディを返して
// 単一インスタンス Cloud Run コンテナを OOM させる経路を塞ぐ（defense-in-depth）。
const MAX_OGP_BYTES = 2 * 1024 * 1024;

// response.text() は仕様上常に UTF-8 でデコードする（content-type charset を無視）ため、
// TextDecoder("utf-8") でのストリーム読み取りは挙動を変えずサイズ上限のみ追加する。
async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<string> {
  // content-length が宣言されていればダウンロード前に拒否する。
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new OgpFetchError("レスポンスが大きすぎます", 413);
  }

  const body = response.body;
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new OgpFetchError("レスポンスが大きすぎます", 413);
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

const requestSchema = z.object({
  url: z.url({ error: "有効なURLを入力してください" }),
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
    let response: Response;
    try {
      response = await fetchPublicHttpResource(currentUrl, {
        method: "GET",
        headers: OGP_FETCH_HEADERS,
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new OgpFetchError(
        redirectCount === 0 ? "無効なURLです" : "無効なリダイレクト先です",
        400,
      );
    }

    const manualResponse = response;
    if (!isRedirectStatus(manualResponse.status)) {
      return { response: manualResponse, finalUrl: currentUrl };
    }

    if (redirectCount >= MAX_OGP_REDIRECTS) {
      throw new OgpFetchError("リダイレクト回数が上限を超えました", 400);
    }

    const redirectUrl = resolveRedirectTarget(
      currentUrl,
      manualResponse.headers.get("location"),
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

    const html = await readBodyWithLimit(response, MAX_OGP_BYTES);
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
