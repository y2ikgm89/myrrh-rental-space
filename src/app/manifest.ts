/**
 * Web App Manifest（PWA）
 *
 * Next.js 16 Metadata API の manifest.ts コンベンション。
 *
 * このルートは PPR 上で `○` (Static) として build prerender される。`'use cache' + safeFetch`
 * を持つ DB query（旧 `getFooterSettings().themeColor`）を直配置すると、Dockerfile builder の
 * placeholder DATABASE_URL で fallback `null` が**永続 baking** され、admin が DB themeColor を
 * 更新しても PWA manifest に永久に反映されない構造的バグになる
 * (rule .claude/rules/db-and-domain.md §6 / memory project_cacheable-fetch-build-prerender-canonical-2026-06-22)。
 *
 * 解: themeColor を静的 `#fafafa` に固定（layout の viewport.themeColor fallback と同値）。
 * PWA install 後の standalone モード chrome 色は静的にする。動的 themeColor が必要なら
 * manifest を ƒ 化する（`await connection()`）必要があり、PWA install のたび DB hit する
 * 無駄が大きいため非採用。
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
 */

import type { MetadataRoute } from "next";
import { SITE_DEFAULTS } from "@/shared/lib/constants";

const STATIC_THEME_COLOR = "#fafafa";

export default function manifest(): MetadataRoute.Manifest {
  return {
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
}
