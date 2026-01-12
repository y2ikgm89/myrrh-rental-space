'use client'

/**
 * 一般タブ
 *
 * 基本情報、連絡先情報を含む
 */

import type { SettingsData } from '@/actions/admin/settings'
import { BasicInfoSection, ContactInfoSection } from '../sections'

interface GeneralTabProps {
  settings: SettingsData
  onUpdate: () => void
}

export function GeneralTab({ settings, onUpdate }: GeneralTabProps) {
  return (
    <div className="space-y-6">
      <BasicInfoSection settings={settings} onUpdate={onUpdate} />
      <ContactInfoSection settings={settings} onUpdate={onUpdate} />
    </div>
  )
}
