/**
 * Public Web App Manifest.
 *
 * Do not use the app-root `app/manifest.ts` file convention here. It emits a
 * manifest link across multiple root layouts, including the IAP-protected admin
 * surface. The public layout links this route explicitly through metadata.
 */

import type { MetadataRoute } from "next";
import { connection } from "next/server";
import {
  getSeoSettings,
  resolveSiteBranding,
} from "@/public/lib/seo/metadata-factory";

const STATIC_THEME_COLOR = "#fafafa";

const MANIFEST_ICONS: MetadataRoute.Manifest["icons"] = [
  {
    src: "/icon-192",
    sizes: "192x192",
    type: "image/png",
  },
  {
    src: "/icon-512",
    sizes: "512x512",
    type: "image/png",
  },
  {
    src: "/icon-512",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
];

export async function GET(): Promise<Response> {
  // getSeoSettings は 'use cache' + safeFetch のため build prerender 汚染を避ける。
  await connection();
  const seoSettings = await getSeoSettings();
  const { siteName, description } = resolveSiteBranding(seoSettings);

  const manifest: MetadataRoute.Manifest = {
    name: siteName,
    short_name: siteName,
    description,
    start_url: "/",
    display: "standalone",
    background_color: STATIC_THEME_COLOR,
    theme_color: STATIC_THEME_COLOR,
    icons: MANIFEST_ICONS,
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
    },
  });
}
