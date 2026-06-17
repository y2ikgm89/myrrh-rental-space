/**
 * サイト設定のZodスキーマ定義 — barrel re-export
 *
 * フォーム入力用スキーマは `form-schema-helpers.ts` と `form-schemas-*.ts` に分割（旧単一 `form-schemas.ts` は廃止）。
 *
 * @module admin/actions/settings/schemas
 */

export {
  businessHoursSettingsSchema,
  type BusinessHoursSettingsInput,
  headerSettingsSchema,
  type HeaderSettingsInput,
  reservationSettingsSchema,
  type ReservationSettingsInput,
  featureModulesSettingsSchema,
  type FeatureModulesSettingsInput,
  sidebarSettingsSchema,
  robotsTxtSettingsSchema,
  type RobotsTxtSettingsInput,
  checkRobotsTxtWarnings,
} from "./basic";

export {
  taxDisplayModeSchema,
  taxSettingsSchema,
  type TaxSettingsInput,
} from "./discount";

export {
  googleCalendarConnectionTestSchema,
  type GoogleCalendarConnectionTestInput,
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
