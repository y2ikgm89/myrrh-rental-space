/**
 * お知らせバー管理ページ
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: ローディングUI
 * - 動的コンテンツ: 管理データ（Suspenseでラップ）
 */

import { Suspense } from 'react'
import { connection } from 'next/server'
import { getAnnouncementBars } from '@/actions/admin/announcement-bar'
import { getAnnouncementBarCarouselSettings } from '@/actions/admin/settings'
import { AnnouncementBarManager } from './_components/AnnouncementBarManager'
import type { ReactElement } from 'react'

/**
 * 動的コンテンツ: お知らせバー管理
 */
async function AnnouncementBarContent(): Promise<ReactElement> {
  // connection() でリクエスト時レンダリングを明示的にシグナル
  await connection()

  const [{ items }, carouselSettings] = await Promise.all([
    getAnnouncementBars(),
    getAnnouncementBarCarouselSettings(),
  ])

  return (
    <AnnouncementBarManager
      initialBars={items}
      initialCarouselSettings={carouselSettings}
    />
  )
}

/**
 * ローディングUI
 */
function AnnouncementBarLoading(): ReactElement {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 bg-gray-200 rounded w-48" />
      <div className="h-64 bg-gray-200 rounded" />
    </div>
  )
}

export default function AnnouncementBarPage(): ReactElement {
  return (
    <Suspense fallback={<AnnouncementBarLoading />}>
      <AnnouncementBarContent />
    </Suspense>
  )
}
