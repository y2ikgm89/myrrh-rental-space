/**
 * Web App Manifest（PWA）
 *
 * Next.js 16 Metadata API の manifest.ts コンベンション。
 * DB からビジネス情報を取得し、動的にマニフェストを生成。
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
 */

import type { MetadataRoute } from 'next'
import { SITE_DEFAULTS } from '@/shared/lib/constants'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_DEFAULTS.name,
    short_name: SITE_DEFAULTS.name,
    description: SITE_DEFAULTS.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#fafafa',
    theme_color: '#fafafa',
    icons: [
      {
        src: '/icon-192',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon-512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
