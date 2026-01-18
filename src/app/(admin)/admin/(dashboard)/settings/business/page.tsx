/**
 * ビジネス設定ページ
 *
 * 事業者情報・営業時間・予約設定をタブで切り替え
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: ローディングUI
 * - 動的コンテンツ: 設定データ（Suspenseでラップ）
 */

import { Suspense } from 'react'
import { connection } from 'next/server'
import { getSettings } from '@/admin/actions/settings'
import { SettingsLayout } from '../_components/SettingsLayout'
import { SettingsTabs } from '../_components/SettingsTabs'
import {
  BusinessInfoSection,
  BusinessHoursSection,
  ReservationSection,
  TermsAgreementSection,
} from '../_components/sections'
import type { ReactElement } from 'react'

/**
 * 動的コンテンツ: ビジネス設定
 */
async function BusinessSettingsContent(): Promise<ReactElement> {
  await connection()

  const settings = await getSettings()

  if (!settings) {
    return (
      <SettingsLayout
        title="ビジネス設定"
        description="事業者情報・営業時間・予約設定"
      >
        <div className="text-center py-8 text-muted-foreground">
          設定を読み込めませんでした
        </div>
      </SettingsLayout>
    )
  }

  const tabs = [
    {
      value: 'info',
      label: '事業者情報',
      content: <BusinessInfoSection settings={settings} />,
    },
    {
      value: 'hours',
      label: '営業時間',
      content: <BusinessHoursSection settings={settings} />,
    },
    {
      value: 'reservation',
      label: '予約',
      content: (
        <div className="space-y-6">
          <ReservationSection settings={settings} />
          <TermsAgreementSection settings={settings} />
        </div>
      ),
    },
  ]

  return (
    <SettingsLayout
      title="ビジネス設定"
      description="事業者情報・営業時間・予約設定"
    >
      <SettingsTabs tabs={tabs} defaultTab="info" />
    </SettingsLayout>
  )
}

/**
 * ローディングUI
 */
function BusinessSettingsLoading(): ReactElement {
  return (
    <SettingsLayout
      title="ビジネス設定"
      description="事業者情報・営業時間・予約設定"
    >
      <div className="animate-pulse space-y-6">
        <div className="flex gap-1 h-10 bg-muted rounded-lg p-1">
          <div className="h-8 w-20 bg-gray-300 rounded-md" />
          <div className="h-8 w-16 bg-gray-200 rounded-md" />
          <div className="h-8 w-12 bg-gray-200 rounded-md" />
        </div>
        <div className="h-48 bg-gray-200 rounded" />
      </div>
    </SettingsLayout>
  )
}

export default function BusinessSettingsPage(): ReactElement {
  return (
    <Suspense fallback={<BusinessSettingsLoading />}>
      <BusinessSettingsContent />
    </Suspense>
  )
}
