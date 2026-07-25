/**
 * 既定 Open Graph 画像 — ImageResponse Route Handler。
 *
 * Metadata API（`resolveOpenGraphImages`）が `/opengraph-image` を指し、
 * ここで Settings 駆動の brand 画像を返す。file convention は使わない
 * （動的 alt は Metadata 側。本 RH は `apple-icon` と同型）。
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
