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
 * - Cookie同意設定
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
} from "./types";

// =============================================================================
// Schemas (Input Types)
// =============================================================================

export type {
  BusinessHoursSettingsInput,
  GoogleCalendarSettingsInput,
  TwoWaySyncSettingsInput,
  ReservationSettingsInput,
  AnnouncementBarCarouselSettingsInput,
  DiscountSettingsInput,
  DurationDiscountRuleInput,
  HeaderSettingsInput,
} from "./schemas";

// =============================================================================
// Basic Actions
// =============================================================================

export {
  updateBasicInfo,
  updateLayoutSettings,
  updateMetaSettings,
  updateAnalyticsSettings,
  updateSearchVerification,
} from "./basic";

// =============================================================================
// Business Actions
// =============================================================================

export {
  updateBusinessInfo,
  updateContactInfo,
  updateBusinessHoursSettings,
} from "./business";

// =============================================================================
// Email Actions
// =============================================================================

export { updateEmailSettings, updateNotificationSettings } from "./email";

// =============================================================================
// Google Calendar Actions
// =============================================================================

export {
  updateGoogleCalendarSettings,
  testGoogleCalendarConnectionAction,
  clearGoogleCalendarServiceAccount,
  updateTwoWaySyncSettings,
  setupCalendarWebhook,
  stopCalendarWebhook,
  triggerManualSync,
  toggleEventImport,
} from "./google-calendar";

// =============================================================================
// Google Business Profile Actions
// =============================================================================

export {
  initiateGbpAuth,
  revokeGbpAuth,
  triggerGbpSync,
  toggleLocationGbpSync,
} from "./google-business-profile";

// =============================================================================
// Stripe Actions
// =============================================================================

export {
  updateStripeSettings,
  testStripeConnectionAction,
  clearStripeKeys,
} from "./stripe";

export type { StripeSettingsInput } from "@/admin/lib/validations/stripe";

// =============================================================================
// Other Actions
// =============================================================================

export {
  updateMaintenanceSettings,
  updateCookieConsentSettings,
  updateReservationSettings,
  updateSidebarSettings,
  updateAnnouncementBarCarouselSettings,
  updateHeaderSettings,
  updateFooterSettings,
  updateFeatureModulesSettings,
} from "./other";

// =============================================================================
// Discount Actions
// =============================================================================

export { updateDiscountSettings } from "./discount";

export type { DiscountSettingsData } from "@/shared/domain/settings/types";

// =============================================================================
// Tax Actions
// =============================================================================

export { updateTaxSettings } from "./tax";

export type { TaxSettings } from "@/shared/domain/settings/types";
export type { TaxSettingsInput } from "./schemas";

// =============================================================================
// robots.txt Actions
// =============================================================================

export { updateRobotsTxtSettings, resetRobotsTxtToDefault } from "./robots-txt";

export { DEFAULT_ROBOTS_TXT } from "@/shared/domain/settings/robots-txt";

export type { RobotsTxtData } from "@/shared/domain/settings/types";
export type { RobotsTxtSettingsInput } from "./schemas";
