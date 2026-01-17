/**
 * 外部連携設定ページ
 *
 * 各外部サービスAPIキーをタブで切り替え
 * Next.js 16 PPR対応
 */

import { Suspense } from 'react'
import { connection } from 'next/server'
import {
  getResendConfig,
  getTurnstileConfig,
  getGoogleMapsConfig,
  getCustomApiKeys,
} from '@/actions/admin/api-keys'
import { SettingsLayout } from '../_components/SettingsLayout'
import { SettingsTabs } from '../_components/SettingsTabs'
import {
  ResendSection,
  TurnstileSection,
  GoogleMapsSection,
  CustomApiKeysSection,
} from '../_components/sections'
import type { ReactElement } from 'react'

/**
 * 動的コンテンツ: API設定
 */
async function ApiSettingsContent(): Promise<ReactElement> {
  await connection()

  const [resendConfig, turnstileConfig, googleMapsConfig, customApiKeys] =
    await Promise.all([
      getResendConfig(),
      getTurnstileConfig(),
      getGoogleMapsConfig(),
      getCustomApiKeys(),
    ])

  const tabs = [
    {
      value: 'resend',
      label: 'Resend',
      content: <ResendSection config={resendConfig} />,
    },
    {
      value: 'turnstile',
      label: 'Turnstile',
      content: <TurnstileSection config={turnstileConfig} />,
    },
    {
      value: 'google-maps',
      label: 'Google Maps',
      content: <GoogleMapsSection config={googleMapsConfig} />,
    },
    {
      value: 'custom',
      label: 'カスタム',
      content: <CustomApiKeysSection keys={customApiKeys} />,
    },
  ]

  return (
    <>
      <div className="mb-4">
        <p className="text-sm text-muted-foreground">
          すべてのシークレットキーは暗号化して保存されます。
        </p>
      </div>
      <SettingsTabs tabs={tabs} defaultTab="resend" />
    </>
  )
}

/**
 * ローディングUI
 */
function ApiSettingsLoading(): ReactElement {
  return (
    <div className="space-y-6">
      <div className="mb-4">
        <p className="text-sm text-muted-foreground">
          すべてのシークレットキーは暗号化して保存されます。
        </p>
      </div>
      <div className="animate-pulse space-y-6">
        <div className="flex gap-1 h-10 bg-muted rounded-lg p-1">
          <div className="h-8 w-16 bg-gray-300 rounded-md" />
          <div className="h-8 w-18 bg-gray-200 rounded-md" />
          <div className="h-8 w-24 bg-gray-200 rounded-md" />
          <div className="h-8 w-16 bg-gray-200 rounded-md" />
        </div>
        <div className="h-48 bg-gray-200 rounded" />
      </div>
    </div>
  )
}

export default function ApiSettingsPage(): ReactElement {
  return (
    <SettingsLayout
      title="外部連携"
      description="外部サービスとの連携に必要なAPIキーを管理します"
    >
      <Suspense fallback={<ApiSettingsLoading />}>
        <ApiSettingsContent />
      </Suspense>
    </SettingsLayout>
  )
}
