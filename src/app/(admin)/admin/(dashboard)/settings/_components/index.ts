/**
 * 設定画面コンポーネント エクスポート
 */

// ページクライアント
export { SettingsPageClient } from './SettingsPageClient'

// タブナビゲーション
export { SettingsTabs, SETTINGS_TABS, TAB_CONFIGS } from './SettingsTabs'
export type { SettingsTabId, TabConfig } from './SettingsTabs'

// タブコンポーネント
export {
  GeneralTab,
  BusinessTab,
  SeoTab,
  EmailTab,
  BookingTab,
  SystemTab,
} from './tabs'

// セクションコンポーネント
export {
  BasicInfoSection,
  ContactInfoSection,
  SeoSection,
  EmailSection,
  NotificationSection,
  ReservationSection,
  MaintenanceSection,
  BusinessInfoSection,
  BusinessHoursSection,
} from './sections'
