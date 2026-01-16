'use client'

/**
 * メールタブ
 *
 * メール設定、通知設定を含む
 */

import type { SettingsData } from '@/actions/admin/settings'
import { EmailSection, NotificationSection } from '../sections'

interface EmailTabProps {
  settings: SettingsData
}

export function EmailTab({ settings }: EmailTabProps) {
  return (
    <div className="space-y-6">
      <EmailSection settings={settings} />
      <NotificationSection settings={settings} />
    </div>
  )
}
