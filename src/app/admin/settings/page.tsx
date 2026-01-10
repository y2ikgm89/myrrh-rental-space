'use client'

/**
 * サイト設定ページ
 *
 * 6タブ構成の設定管理画面
 * URL状態管理: nuqs（`?tab=general` など）
 *
 * @see docs/plans/settings-tab-refactoring.md
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQueryState, parseAsStringEnum } from 'nuqs'
import { Button } from '@/components/admin/ui'
import { getSettings } from '@/actions/admin/settings'
import type { SettingsData } from '@/actions/admin/settings'
import { SettingsTabs, SETTINGS_TABS } from './_components'
import type { SettingsTabId } from './_components'

// =============================================================================
// Loading Component
// =============================================================================

function SettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-10 w-40 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-10 w-full animate-pulse rounded bg-muted" />
      <div className="space-y-4">
        <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
        <div className="h-48 w-full animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export default function SettingsPage() {
  // URL状態管理（nuqs）
  const [activeTab, setActiveTab] = useQueryState(
    'tab',
    parseAsStringEnum([...SETTINGS_TABS]).withDefault('general')
  )

  // 設定データ
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // 設定を読み込み
  const loadSettings = async () => {
    try {
      const data = await getSettings()
      setSettings(data)
    } catch (error) {
      console.error('Failed to load settings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()
  }, [])

  // タブ変更ハンドラ
  const handleTabChange = (tab: SettingsTabId) => {
    setActiveTab(tab)
  }

  // ローディング中
  if (isLoading || !settings) {
    return <SettingsLoading />
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">サイト設定</h1>
          <p className="text-muted-foreground">サイト全体の設定を管理します</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/settings/navigation">ナビゲーション管理</Link>
        </Button>
      </div>

      {/* タブコンテンツ */}
      <SettingsTabs
        activeTab={activeTab as SettingsTabId}
        onTabChange={handleTabChange}
        settings={settings}
        onSettingsUpdate={loadSettings}
      />
    </div>
  )
}
