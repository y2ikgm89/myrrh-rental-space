'use client'

/**
 * システムタブ
 *
 * メンテナンス設定を含む
 */

import type { SettingsData } from '@/actions/admin/settings'
import { MaintenanceSection } from '../sections'

interface SystemTabProps {
  settings: SettingsData
  onUpdate: () => void
}

export function SystemTab({ settings, onUpdate }: SystemTabProps) {
  return (
    <div className="space-y-6">
      <MaintenanceSection settings={settings} onUpdate={onUpdate} />
    </div>
  )
}
