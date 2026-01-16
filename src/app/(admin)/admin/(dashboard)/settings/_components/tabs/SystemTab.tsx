'use client'

/**
 * システムタブ
 *
 * メンテナンス設定・Cookie同意設定を含む
 * お知らせバーカルーセル設定は「お知らせバー管理」画面に統合
 */

import type { SettingsData } from '@/actions/admin/settings'
import { MaintenanceSection } from '../sections'
import { CookieConsentSection } from '../sections/CookieConsentSection'

interface SystemTabProps {
  settings: SettingsData
}

export function SystemTab({ settings }: SystemTabProps) {
  return (
    <div className="space-y-6">
      <MaintenanceSection settings={settings} />
      <CookieConsentSection settings={settings} />
    </div>
  )
}
