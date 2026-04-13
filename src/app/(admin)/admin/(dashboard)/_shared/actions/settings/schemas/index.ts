/**
 * サイト設定のZodスキーマ定義 — barrel re-export
 *
 * フォーム入力用スキーマは `form-schema-helpers.ts` と `form-schemas-*.ts` に分割（旧単一 `form-schemas.ts` は廃止）。
 *
 * @module admin/actions/settings/schemas
 */

export {
  basicInfoSchema,
  type BasicInfoInput,
  businessInfoSchema,
  type BusinessInfoInput,
  contactInfoSchema,
  type ContactInfoInput,
  timeSlotSchema,
  businessHoursDaySchema,
  businessHoursSettingsSchema,
  type BusinessHoursSettingsInput,
  metaSettingsSchema,
  type MetaSettingsInput,
  analyticsSettingsSchema,
  type AnalyticsSettingsInput,
  searchVerificationSchema,
  type SearchVerificationInput,
  layoutSettingsSchema,
  type LayoutSettingsInput,
  headerSettingsSchema,
  type HeaderSettingsInput,
  footerSettingsSchema,
  type FooterSettingsInput,
  maintenanceSettingsSchema,
  type MaintenanceSettingsInput,
  cookieConsentSettingsSchema,
  type CookieConsentSettingsInput,
  reservationSettingsSchema,
  type ReservationSettingsInput,
  permalinkSettingsSchema,
  type PermalinkSettingsInput,
  sidebarSettingsSchema,
  meoSettingsSchema,
  type MeoSettingsInput,
  robotsTxtSettingsSchema,
  type RobotsTxtSettingsInput,
  checkRobotsTxtWarnings,
} from "./basic";

export {
  durationDiscountRuleSchema,
  type DurationDiscountRuleInput,
  discountSettingsSchema,
  type DiscountSettingsInput,
  taxDisplayModeSchema,
  taxSettingsSchema,
  type TaxSettingsInput,
} from "./discount";

export {
  emailSettingsSchema,
  type EmailSettingsInput,
  notificationSettingsSchema,
  type NotificationSettingsInput,
} from "./email";

export {
  googleCalendarSettingsSchema,
  type GoogleCalendarSettingsInput,
  googleCalendarConnectionTestSchema,
  type GoogleCalendarConnectionTestInput,
  twoWaySyncSettingsSchema,
  type TwoWaySyncSettingsInput,
} from "./google-calendar";

export {
  announcementBarCarouselSettingsSchema,
  type AnnouncementBarCarouselSettingsInput,
} from "./announcement-bar";

export * from "./form-schema-helpers";
export * from "./form-schemas-brand-contact";
export * from "./form-schemas-booking-tax-terms";
export * from "./form-schemas-seo-analytics";
export * from "./form-schemas-email-notification";
export * from "./form-schemas-privacy-appearance";
export * from "./form-schemas-security-integrations";
