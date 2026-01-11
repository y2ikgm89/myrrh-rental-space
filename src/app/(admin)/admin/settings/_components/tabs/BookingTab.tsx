'use client'

/**
 * 予約タブ
 *
 * 予約設定・規約同意設定・Google Calendar連携・iCalフィードを含む
 */

import type { SettingsData } from '@/actions/admin/settings'
import {
  ReservationSection,
  TermsAgreementSection,
  GoogleCalendarSection,
  TwoWaySyncSection,
  ICalFeedSection,
} from '../sections'

interface BookingTabProps {
  settings: SettingsData
  onUpdate: () => void
}

export function BookingTab({ settings, onUpdate }: BookingTabProps) {
  return (
    <div className="space-y-6">
      <ReservationSection settings={settings} onUpdate={onUpdate} />
      <TermsAgreementSection settings={settings} onUpdate={onUpdate} />
      <GoogleCalendarSection settings={settings} onUpdate={onUpdate} />
      <TwoWaySyncSection settings={settings} onUpdate={onUpdate} />
      <ICalFeedSection onUpdate={onUpdate} />
    </div>
  )
}
