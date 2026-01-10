'use client'

/**
 * 事業者タブ
 *
 * 事業者情報、営業時間設定を含む
 */

import type { SettingsData } from '@/actions/admin/settings'
import { BusinessInfoSection, BusinessHoursSection } from '../sections'

interface BusinessTabProps {
  settings: SettingsData
  onUpdate: () => void
}

export function BusinessTab({ settings, onUpdate }: BusinessTabProps) {
  return (
    <div className="space-y-6">
      <BusinessInfoSection settings={settings} onUpdate={onUpdate} />
      <BusinessHoursSection settings={settings} onUpdate={onUpdate} />
    </div>
  )
}
