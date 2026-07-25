/**
 * 既定 Twitter Card 画像 — ImageResponse Route Handler。
 *
 * Metadata API（`resolveTwitterImages`）が `/twitter-image` を指す。
 * opengraph-image と同型の brand 画像を返す。
 *
 * @see https://nextjs.org/docs/app/api-reference/functions/image-response
 */

import { connection } from "next/server";
import {
  getSeoSettings,
  resolveSiteBranding,
} from "@/public/lib/seo/metadata-factory";
import { createDefaultBrandOgImageResponse } from "@/public/lib/seo/default-brand-og-image";

export async function GET(): Promise<Response> {
  await connection();
  const { siteName } = resolveSiteBranding(await getSeoSettings());
  return createDefaultBrandOgImageResponse(siteName);
}
