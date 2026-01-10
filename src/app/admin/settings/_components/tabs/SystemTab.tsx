'use client'

/**
 * システムタブ
 *
 * メンテナンス設定・Cookie同意設定・お知らせバーカルーセル設定を含む
 */

import type { SettingsData } from '@/actions/admin/settings'
import { MaintenanceSection } from '../sections'
import { CookieConsentSection } from '../sections/CookieConsentSection'
import { AnnouncementBarCarouselSection } from '../sections/AnnouncementBarCarouselSection'

interface SystemTabProps {
  settings: SettingsData
  onUpdate: () => void
}

export function SystemTab({ settings, onUpdate }: SystemTabProps) {
  return (
    <div className="space-y-6">
      <MaintenanceSection settings={settings} onUpdate={onUpdate} />
      <CookieConsentSection settings={settings} onUpdate={onUpdate} />
      <AnnouncementBarCarouselSection settings={settings} onUpdate={onUpdate} />
    </div>
  )
}
