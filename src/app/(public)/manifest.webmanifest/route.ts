/**
 * Public Web App Manifest.
 *
 * Do not use the app-root `app/manifest.ts` file convention here. It emits a
 * manifest link across multiple root layouts, including the IAP-protected admin
 * surface. The public layout links this route explicitly through metadata.
 */

import type { MetadataRoute } from "next";
import { SITE_DEFAULTS } from "@/shared/lib/constants";

const STATIC_THEME_COLOR = "#fafafa";

const PUBLIC_MANIFEST: MetadataRoute.Manifest = {
  name: SITE_DEFAULTS.name,
  short_name: SITE_DEFAULTS.name,
  description: SITE_DEFAULTS.description,
  start_url: "/",
  display: "standalone",
  background_color: STATIC_THEME_COLOR,
  theme_color: STATIC_THEME_COLOR,
  icons: [
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
  ],
};

export function GET(): Response {
  return new Response(JSON.stringify(PUBLIC_MANIFEST), {
    headers: {
      "Content-Type": "application/manifest+json",
    },
  });
}
