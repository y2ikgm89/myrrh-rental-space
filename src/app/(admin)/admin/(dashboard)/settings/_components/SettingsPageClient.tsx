'use client'

/**
 * SettingsPageClient
 *
 * 設定ページのクライアントコンポーネント
 * URL状態管理とタブ切り替えを担当
 */

import Link from 'next/link'
import { useQueryState, parseAsStringEnum } from 'nuqs'
import { Button } from '@/components/admin/ui'
import type { SettingsData } from '@/actions/admin/settings'
import { SettingsTabs, SETTINGS_TABS } from '.'
import type { SettingsTabId } from '.'

interface SettingsPageClientProps {
  initialSettings: SettingsData
}

export function SettingsPageClient({ initialSettings }: SettingsPageClientProps) {
  // URL状態管理（nuqs）
  const [activeTab, setActiveTab] = useQueryState(
    'tab',
    parseAsStringEnum([...SETTINGS_TABS]).withDefault('general')
  )

  // タブ変更ハンドラ
  const handleTabChange = (tab: SettingsTabId) => {
    setActiveTab(tab)
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">サイト設定</h1>
          <p className="text-muted-foreground">サイト全体の設定を管理します</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/settings/permissions">権限マトリクス</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/audit-logs">監査ログ</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/settings/announcement-bar">お知らせバー</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/settings/navigation">ナビゲーション</Link>
          </Button>
        </div>
      </div>

      {/* タブコンテンツ */}
      <SettingsTabs
        activeTab={activeTab as SettingsTabId}
        onTabChange={handleTabChange}
        settings={initialSettings}
      />
    </div>
  )
}
