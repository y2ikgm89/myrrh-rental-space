/**
 * Web App Manifest（PWA）
 *
 * Next.js 16 Metadata API の manifest.ts コンベンション。
 * DB からビジネス情報を取得し、動的にマニフェストを生成。
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
 */

import type { MetadataRoute } from "next";
import { SITE_DEFAULTS } from "@/shared/lib/constants";
import { getFooterSettings } from "@/shared/domain/settings/queries/display";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  // themeColor は getFooterSettings の 'use cache' 経由で取得（cache 再利用）。
  // 公開ページ layout の viewport.themeColor と同一 Settings SSoT に揃える。
  const { themeColor } = await getFooterSettings();

  return {
    name: SITE_DEFAULTS.name,
    short_name: SITE_DEFAULTS.name,
    description: SITE_DEFAULTS.description,
    start_url: "/",
    display: "standalone",
    background_color: themeColor,
    theme_color: themeColor,
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
}
