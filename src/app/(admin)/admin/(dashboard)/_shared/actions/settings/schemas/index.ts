/**
 * サイト設定のZodスキーマ定義 — barrel re-export
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
  seoSettingsSchema,
  type SeoSettingsInput,
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
  termsAgreementSettingsSchema,
  type TermsAgreementSettingsInput,
  reservationSettingsSchema,
  type ReservationSettingsInput,
  permalinkSettingsSchema,
  type PermalinkSettingsInput,
  sidebarSettingsSchema,
  type SidebarSettingsInput,
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

export * from "./form-schemas";
