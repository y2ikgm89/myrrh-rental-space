/**
 * 通知・決済設定ページ
 *
 * メール・通知・決済設定をタブで切り替え
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: ローディングUI
 * - 動的コンテンツ: 設定データ（Suspenseでラップ）
 */

import { Suspense } from 'react'
import { getSettings } from '@/admin/queries/settings'
import { SettingsLayout } from '../_components/SettingsLayout'
import { SettingsTabs } from '../_components/SettingsTabs'
import {
  EmailSection,
  NotificationSection,
  StripeSection,
} from '../_components/sections'
import type { ReactElement } from 'react'

/**
 * 動的コンテンツ: 通知・決済設定
 */
async function NotifySettingsContent(): Promise<ReactElement> {
  const settings = await getSettings()

  if (!settings) {
    return (
      <SettingsLayout
        title="通知・決済"
        description="メール通知とオンライン決済の設定"
      >
        <div className="text-center py-8 text-muted-foreground">
          設定を読み込めませんでした
        </div>
      </SettingsLayout>
    )
  }

  const tabs = [
    {
      value: 'email',
      label: 'メール',
      content: <EmailSection settings={settings} />,
    },
    {
      value: 'notification',
      label: '通知',
      content: <NotificationSection settings={settings} />,
    },
    {
      value: 'payment',
      label: '決済',
      content: <StripeSection settings={settings} />,
    },
  ]

  return (
    <SettingsLayout
      title="通知・決済"
      description="メール通知とオンライン決済の設定"
    >
      <SettingsTabs tabs={tabs} defaultTab="email" />
    </SettingsLayout>
  )
}

/**
 * ローディングUI
 */
function NotifySettingsLoading(): ReactElement {
  return (
    <SettingsLayout
      title="通知・決済"
      description="メール通知とオンライン決済の設定"
    >
      <div className="animate-pulse space-y-6">
        <div className="flex gap-1 h-10 bg-muted rounded-lg p-1">
          <div className="h-8 w-14 bg-muted-foreground/30 rounded-md" />
          <div className="h-8 w-12 bg-muted rounded-md" />
          <div className="h-8 w-12 bg-muted rounded-md" />
        </div>
        <div className="h-48 bg-muted rounded" />
      </div>
    </SettingsLayout>
  )
}

export default async function NotifySettingsPage(): Promise<ReactElement> {
  return (
    <Suspense fallback={<NotifySettingsLoading />}>
      <NotifySettingsContent />
    </Suspense>
  )
}



