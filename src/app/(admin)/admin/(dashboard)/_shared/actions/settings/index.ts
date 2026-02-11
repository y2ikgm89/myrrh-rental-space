/**
 * サイト設定管理 Server Actions
 *
 * 管理画面でのサイト全体の設定を管理するServer Actions。
 * 基本情報、事業者情報、SEO設定、決済設定、Google Calendar連携など、
 * システム全体の設定を更新・取得します。
 *
 * ## 主な機能
 * - サイト基本情報の管理
 * - 事業者情報・連絡先情報の管理
 * - SEO・Analytics設定
 * - Stripe決済設定
 * - Google Calendar連携設定
 * - Cookie同意・規約同意設定
 * - レイアウト・サイドバー設定
 *
 * @module admin/actions/settings
 */

// =============================================================================
// Types
// =============================================================================

export type {
  BusinessTimeSlot,
  BusinessHoursDay,
  BusinessHours,
  SettingsData,
} from './types'

// =============================================================================
// Schemas (Input Types)
// =============================================================================

export type {
  BasicInfoInput,
  BusinessInfoInput,
  ContactInfoInput,
  BusinessHoursSettingsInput,
  MeoSettingsInput,
  SeoSettingsInput,
  LayoutSettingsInput,
  EmailSettingsInput,
  NotificationSettingsInput,
  GoogleCalendarSettingsInput,
  TwoWaySyncSettingsInput,
  MaintenanceSettingsInput,
  CookieConsentSettingsInput,
  TermsAgreementSettingsInput,
  ReservationSettingsInput,
  AnnouncementBarCarouselSettingsInput,
  SidebarSettingsInput,
  PermalinkSettingsInput,
  DiscountSettingsInput,
  DurationDiscountRuleInput,
  HeaderSettingsInput,
} from './schemas'

// =============================================================================
// Basic Actions
// =============================================================================

export {
  getSettings,
  getPublicSettings,
  updateBasicInfo,
  updateLayoutSettings,
  updateSeoSettings,
} from './basic'

// =============================================================================
// Business Actions
// =============================================================================

export {
  updateBusinessInfo,
  updateContactInfo,
  updateBusinessHoursSettings,
  updateMeoSettings,
} from './business'

// =============================================================================
// Email Actions
// =============================================================================

export {
  updateEmailSettings,
  updateNotificationSettings,
} from './email'

// =============================================================================
// Google Calendar Actions
// =============================================================================

export {
  updateGoogleCalendarSettings,
  testGoogleCalendarConnectionAction,
  testGoogleCalendarOAuthAction,
  clearGoogleCalendarServiceAccount,
  disconnectGoogleCalendarOAuth,
  getGoogleCalendarSettings,
  updateTwoWaySyncSettings,
  setupCalendarWebhook,
  stopCalendarWebhook,
  triggerManualSync,
} from './google-calendar'

// =============================================================================
// Stripe Actions
// =============================================================================

export {
  updateStripeSettings,
  testStripeConnectionAction,
  clearStripeKeys,
} from './stripe'

export type { StripeSettingsInput } from '@/admin/lib/validations/stripe'

// =============================================================================
// Other Actions
// =============================================================================

export {
  updateMaintenanceSettings,
  updateCookieConsentSettings,
  getTermsAgreementSettings,
  updateTermsAgreementSettings,
  getCancellationPolicies,
  updateReservationSettings,
  updateSidebarSettings,
  getAnnouncementBarCarouselSettings,
  updateAnnouncementBarCarouselSettings,
  getPermalinkSettings,
  updatePermalinkSettings,
  updateHeaderSettings,
} from './other'

// =============================================================================
// Discount Actions
// =============================================================================

export {
  getDiscountSettings,
  updateDiscountSettings,
} from './discount'

export type { DiscountSettingsData } from './discount'
export type { DurationDiscountRuleInput as DurationDiscountRule } from './schemas'

// =============================================================================
// Tax Actions
// =============================================================================

export {
  getTaxSettings,
  updateTaxSettings,
  getPublicTaxSettings,
} from './tax'

export type { TaxSettingsData } from './tax'
export type { TaxSettingsInput } from './schemas'

// =============================================================================
// robots.txt Actions
// =============================================================================

export {
  getRobotsTxtSettings,
  updateRobotsTxtSettings,
  resetRobotsTxtToDefault,
} from './robots-txt'

export { DEFAULT_ROBOTS_TXT } from './robots-txt-constants'

export type { RobotsTxtData } from './robots-txt'
export type { RobotsTxtSettingsInput } from './schemas'
