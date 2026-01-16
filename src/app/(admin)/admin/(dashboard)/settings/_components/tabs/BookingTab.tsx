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
}

export function BookingTab({ settings }: BookingTabProps) {
  return (
    <div className="space-y-6">
      <ReservationSection settings={settings} />
      <TermsAgreementSection settings={settings} />
      <GoogleCalendarSection settings={settings} />
      <TwoWaySyncSection settings={settings} />
      <ICalFeedSection />
    </div>
  )
}
