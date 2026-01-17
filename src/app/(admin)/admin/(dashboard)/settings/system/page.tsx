/**
 * システム管理ページ
 *
 * メンテナンス・Cookie同意・権限をタブで切り替え
 */

import { Suspense } from 'react'
import { connection } from 'next/server'
import { getSettings } from '@/actions/admin/settings'
import { SettingsLayout } from '../_components/SettingsLayout'
import { SettingsTabs } from '../_components/SettingsTabs'
import { MaintenanceSection } from '../_components/sections/MaintenanceSection'
import { CookieConsentSection } from '../_components/sections/CookieConsentSection'
import { PermissionsSection } from '../_components/sections/PermissionsSection'
import type { ReactElement } from 'react'

export const metadata = {
  title: 'システム管理 | 管理画面',
}

// =============================================================================
// 動的コンテンツ
// =============================================================================

async function SystemSettingsContent(): Promise<ReactElement> {
  await connection()

  const settings = await getSettings()

  if (!settings) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        設定を読み込めませんでした
      </div>
    )
  }

  const tabs = [
    {
      value: 'maintenance',
      label: 'メンテナンス',
      content: <MaintenanceSection settings={settings} />,
    },
    {
      value: 'cookie',
      label: 'Cookie',
      content: <CookieConsentSection settings={settings} />,
    },
    {
      value: 'permissions',
      label: '権限',
      content: <PermissionsSection />,
    },
  ]

  return <SettingsTabs tabs={tabs} defaultTab="maintenance" />
}

// =============================================================================
// ローディングUI
// =============================================================================

function SystemSettingsLoading(): ReactElement {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex gap-1 h-10 bg-muted rounded-lg p-1">
        <div className="h-8 w-24 bg-gray-300 rounded-md" />
        <div className="h-8 w-16 bg-gray-200 rounded-md" />
        <div className="h-8 w-12 bg-gray-200 rounded-md" />
      </div>
      <div className="h-48 bg-gray-200 rounded" />
    </div>
  )
}

// =============================================================================
// ページ
// =============================================================================

export default function SystemSettingsPage(): ReactElement {
  return (
    <SettingsLayout title="システム管理" description="システム全体の設定を管理">
      <Suspense fallback={<SystemSettingsLoading />}>
        <SystemSettingsContent />
      </Suspense>
    </SettingsLayout>
  )
}
