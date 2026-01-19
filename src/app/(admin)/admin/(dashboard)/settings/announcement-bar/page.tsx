/**
 * お知らせバー管理ページ
 *
 * サイト上部に表示するお知らせバーを管理
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: ローディングUI
 * - 動的コンテンツ: お知らせバーデータ（Suspenseでラップ）
 */

import { Suspense } from 'react'
import { connection } from 'next/server'
import { getAnnouncementBars } from '@/admin/actions/announcement-bar'
import { getAnnouncementBarCarouselSettings } from '@/admin/actions/settings'
import { SettingsLayout } from '../_components/SettingsLayout'
import { AnnouncementBarManager } from '../site/_components/AnnouncementBarManager'
import type { ReactElement } from 'react'

/**
 * 動的コンテンツ: お知らせバー管理
 */
async function AnnouncementBarContent(): Promise<ReactElement> {
  await connection()

  const [{ items: announcementBars }, carouselSettings] = await Promise.all([
    getAnnouncementBars(),
    getAnnouncementBarCarouselSettings(),
  ])

  return (
    <AnnouncementBarManager
      initialBars={announcementBars}
      initialCarouselSettings={carouselSettings}
    />
  )
}

/**
 * ローディングUI
 */
function AnnouncementBarLoading(): ReactElement {
  return (
    <div className="space-y-6">
      {/* タブ */}
      <div className="flex gap-1 h-10 bg-muted rounded-lg p-1">
        <div className="h-8 w-32 animate-pulse rounded-md bg-gray-300" />
        <div className="h-8 w-24 animate-pulse rounded-md bg-gray-200" />
      </div>

      {/* テーブル */}
      <div className="animate-pulse space-y-4">
        <div className="h-64 rounded bg-gray-200" />
      </div>
    </div>
  )
}

export default function AnnouncementBarPage(): ReactElement {
  return (
    <SettingsLayout
      title="お知らせバー管理"
      description="サイト上部に表示するお知らせバーを管理します"
    >
      <Suspense fallback={<AnnouncementBarLoading />}>
        <AnnouncementBarContent />
      </Suspense>
    </SettingsLayout>
  )
}
