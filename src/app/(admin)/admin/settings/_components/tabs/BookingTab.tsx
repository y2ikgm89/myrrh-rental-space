'use client'

/**
 * 予約タブ
 *
 * 予約設定と規約同意設定を含む
 */

import type { SettingsData } from '@/actions/admin/settings'
import { ReservationSection, TermsAgreementSection } from '../sections'

interface BookingTabProps {
  settings: SettingsData
  onUpdate: () => void
}

export function BookingTab({ settings, onUpdate }: BookingTabProps) {
  return (
    <div className="space-y-6">
      <ReservationSection settings={settings} onUpdate={onUpdate} />
      <TermsAgreementSection settings={settings} onUpdate={onUpdate} />
    </div>
  )
}
