/**
 * 設定セクション用フォームスキーマ
 *
 * Server Action スキーマ（nullable）とは別に、フォーム入力用スキーマを定義。
 * フォームでは空文字列を許容し、送信時に emptyToNull で null に変換する。
 */
import { z } from "zod";
import {
  AnalyticsType,
  CalendarSyncMethod,
  DiscountCombinationMode,
  HeaderBackgroundMode,
  HeaderScrollBehavior,
  InstagramFeedLayout,
  LayoutWidth,
  PostPermalinkStructure,
  TaxDisplayMode,
  TaxInputMode,
} from "@/shared/db/enums";
import { SUPPORTED_CURRENCY_VALUES } from "@/admin/lib/stripe-shared";

// =============================================================================
// ヘルパー
// =============================================================================

/** 空文字列 → null 変換（Server Action 送信前に使用） */
export function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// =============================================================================
// Site > General > 基本情報
// =============================================================================

export const basicInfoFormSchema = z.object({
  siteName: z.string().max(100, { error: "100文字以内で入力してください" }),
  siteDescription: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
  faviconUrl: z.string().max(500, { error: "500文字以内で入力してください" }),
  defaultOgpImageUrl: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
  headerLogoUrl: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
  footerLogoUrl: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
  footerCopyright: z
    .string()
    .max(200, { error: "200文字以内で入力してください" }),
  useHeaderLogo: z.boolean(),
  useFooterLogo: z.boolean(),
});

export type BasicInfoFormInput = z.infer<typeof basicInfoFormSchema>;

// =============================================================================
// Site > General > 連絡先情報
// =============================================================================

export const contactInfoFormSchema = z.object({
  phoneNumber: z.string().max(20, { error: "20文字以内で入力してください" }),
  faxNumber: z.string().max(20, { error: "20文字以内で入力してください" }),
  email: z.union([
    z
      .string()
      .email({ error: "有効なメールアドレスを入力してください" })
      .max(100),
    z.literal(""),
  ]),
  address: z.string().max(500, { error: "500文字以内で入力してください" }),
  postalCode: z.string().max(10, { error: "10文字以内で入力してください" }),
  prefecture: z.string().max(10, { error: "10文字以内で入力してください" }),
  city: z.string().max(50, { error: "50文字以内で入力してください" }),
  streetAddress: z
    .string()
    .max(100, { error: "100文字以内で入力してください" }),
  buildingName: z.string().max(100, { error: "100文字以内で入力してください" }),
});

export type ContactInfoFormInput = z.infer<typeof contactInfoFormSchema>;

// =============================================================================
// Site > General > パーマリンク設定
// =============================================================================

export const permalinkFormSchema = z.object({
  postPermalinkStructure: z.enum(PostPermalinkStructure),
  postUrlPrefixEnabled: z.boolean(),
});

export type PermalinkFormInput = z.infer<typeof permalinkFormSchema>;

// =============================================================================
// Site > Security > Turnstile
// =============================================================================

export const turnstileFormSchema = z.object({
  turnstileSiteKey: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
  turnstileSecretKey: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
});

export type TurnstileFormInput = z.infer<typeof turnstileFormSchema>;

// =============================================================================
// Site > Security > Google Maps
// =============================================================================

export const googleMapsFormSchema = z.object({
  googleMapsApiKey: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
});

export type GoogleMapsFormInput = z.infer<typeof googleMapsFormSchema>;

// =============================================================================
// Site > Integrations > iCal フィード
// =============================================================================

export const icalFeedFormSchema = z.object({
  icalFeedEnabled: z.boolean(),
  icalFeedIncludeCustomerInfo: z.boolean(),
});

export type ICalFeedFormInput = z.infer<typeof icalFeedFormSchema>;

// =============================================================================
// Site > General > メンテナンス
// =============================================================================

export const maintenanceFormSchema = z.object({
  maintenanceMode: z.boolean(),
  maintenanceMessage: z
    .string()
    .max(1000, { error: "1000文字以内で入力してください" }),
});

export type MaintenanceFormInput = z.infer<typeof maintenanceFormSchema>;

// =============================================================================
// Site > Payment > 消費税
// =============================================================================

export const taxFormSchema = z.object({
  taxStandardRate: z.number().min(0).max(100),
  taxReducedRate: z.number().min(0).max(100),
  taxDisplayModeAdmin: z.enum(TaxDisplayMode),
  taxDisplayModePublic: z.enum(TaxDisplayMode),
  taxInputMode: z.enum(TaxInputMode),
});

export type TaxFormInput = z.infer<typeof taxFormSchema>;

// =============================================================================
// Site > Booking > 規約同意
// =============================================================================

export const termsAgreementFormSchema = z.object({
  termsAgreementEnabled: z.boolean(),
  termsAgreementText: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
  requireTermsAgreement: z.boolean(),
  requirePrivacyAgreement: z.boolean(),
});

export type TermsAgreementFormInput = z.infer<typeof termsAgreementFormSchema>;

// =============================================================================
// Site > SEO > メタ情報
// =============================================================================

export const metaFormSchema = z.object({
  defaultMetaDescription: z
    .string()
    .max(160, { error: "160文字以内で入力してください" }),
  defaultMetaKeywords: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
  defaultOgpTitle: z
    .string()
    .max(60, { error: "60文字以内で入力してください" }),
  defaultOgpDescription: z
    .string()
    .max(160, { error: "160文字以内で入力してください" }),
});

export type MetaFormInput = z.infer<typeof metaFormSchema>;

// =============================================================================
// Site > SEO > Analytics設定
// =============================================================================

/** analyticsType: フォームでは "none" を使い、送信時に null に変換する */
export const analyticsFormSchema = z.object({
  analyticsType: z.union([z.enum(AnalyticsType), z.literal("none")]),
  googleAnalyticsId: z
    .string()
    .max(50, { error: "50文字以内で入力してください" }),
  googleTagManagerId: z
    .string()
    .max(50, { error: "50文字以内で入力してください" }),
  gaPropertyId: z.string().max(20, { error: "20文字以内で入力してください" }),
});

export type AnalyticsFormInput = z.infer<typeof analyticsFormSchema>;

// =============================================================================
// Site > SEO > 検索エンジン検証
// =============================================================================

export const searchVerificationFormSchema = z.object({
  googleSearchConsoleId: z
    .string()
    .max(100, { error: "100文字以内で入力してください" }),
  bingWebmasterToolsId: z
    .string()
    .max(100, { error: "100文字以内で入力してください" }),
});

export type SearchVerificationFormInput = z.infer<
  typeof searchVerificationFormSchema
>;

// =============================================================================
// Site > Email > メール設定
// =============================================================================

export const emailFormSchema = z.object({
  senderEmail: z.union([
    z
      .string()
      .email({ error: "有効なメールアドレスを入力してください" })
      .max(100),
    z.literal(""),
  ]),
  senderName: z.string().max(100, { error: "100文字以内で入力してください" }),
  replyToEmail: z.union([
    z
      .string()
      .email({ error: "有効なメールアドレスを入力してください" })
      .max(100),
    z.literal(""),
  ]),
  sendReservationConfirmationEmail: z.boolean(),
  sendAdminNotificationEmail: z.boolean(),
  notificationEmailAddresses: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
});

export type EmailFormInput = z.infer<typeof emailFormSchema>;

// =============================================================================
// Site > Email > 通知設定
// =============================================================================

export const notificationFormSchema = z.object({
  notifyNewReservation: z.boolean(),
  notifyReservationChange: z.boolean(),
  notifyReservationCancel: z.boolean(),
  notifyNewInquiry: z.boolean(),
});

export type NotificationFormInput = z.infer<typeof notificationFormSchema>;

// =============================================================================
// Site > SEO > MEO対策設定
// =============================================================================

export const meoFormSchema = z.object({
  latitude: z.string(),
  longitude: z.string(),
  priceRange: z.string().max(100, { error: "100文字以内で入力してください" }),
  googleBusinessPlaceId: z
    .string()
    .max(200, { error: "200文字以内で入力してください" }),
  googleReviewUrl: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
  businessAttributes: z.record(z.string(), z.boolean()),
  paymentAccepted: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
});

export type MeoFormInput = z.infer<typeof meoFormSchema>;

// =============================================================================
// Site > Privacy > Cookie同意設定
// =============================================================================

export const cookieConsentFormSchema = z.object({
  cookieConsentEnabled: z.boolean(),
  cookieConsentMessage: z
    .string()
    .max(1000, { error: "1000文字以内で入力してください" }),
  cookieConsentAcceptText: z
    .string()
    .max(50, { error: "50文字以内で入力してください" }),
  cookieConsentRejectText: z
    .string()
    .max(50, { error: "50文字以内で入力してください" }),
  cookieConsentPolicyUrl: z
    .string()
    .max(200, { error: "200文字以内で入力してください" }),
});

export type CookieConsentFormInput = z.infer<typeof cookieConsentFormSchema>;

// =============================================================================
// Site > Appearance > ヘッダー設定
// =============================================================================

export const headerFormSchema = z.object({
  headerScrollBehavior: z.enum(HeaderScrollBehavior),
  headerBackgroundMode: z.enum(HeaderBackgroundMode),
});

export type HeaderFormInput = z.infer<typeof headerFormSchema>;

// =============================================================================
// Site > Appearance > フッター設定
// =============================================================================

export const footerFormSchema = z.object({
  footerTagline: z
    .string()
    .max(200, { error: "200文字以内で入力してください" }),
  footerNavigationLabel: z
    .string()
    .max(50, { error: "50文字以内で入力してください" }),
  footerContactLabel: z
    .string()
    .max(50, { error: "50文字以内で入力してください" }),
  footerHoursLabel: z
    .string()
    .max(50, { error: "50文字以内で入力してください" }),
  footerShowSocialLinks: z.boolean(),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, {
    error: "有効なHEXカラーコードを入力してください（例: #fafafa）",
  }),
});

export type FooterFormInput = z.infer<typeof footerFormSchema>;

// =============================================================================
// Site > Appearance > サイドバー設定
// =============================================================================

export const sidebarFormSchema = z.object({
  sidebarEnabled: z.boolean(),
  sidebarWidgets: z.object({
    search: z.boolean(),
    recent: z.boolean(),
    popular: z.boolean(),
    categories: z.boolean(),
    tags: z.boolean(),
  }),
  sidebarRecentCount: z.number().int().min(1).max(20),
  sidebarPopularCount: z.number().int().min(1).max(20),
});

export type SidebarFormInput = z.infer<typeof sidebarFormSchema>;

// =============================================================================
// Site > Appearance > レイアウト設定
// =============================================================================

export const layoutFormSchema = z.object({
  containerWidth: z.enum(LayoutWidth),
  containerWidthCustom: z.string(),
  contentWidth: z.enum(LayoutWidth),
  contentWidthCustom: z.string(),
});

export type LayoutFormInput = z.infer<typeof layoutFormSchema>;

// =============================================================================
// Site > General > 事業者情報
// =============================================================================

export const businessInfoFormSchema = z.object({
  businessName: z.string().max(100, { error: "100文字以内で入力してください" }),
  businessNameKana: z
    .string()
    .max(100, { error: "100文字以内で入力してください" }),
  representativeName: z
    .string()
    .max(50, { error: "50文字以内で入力してください" }),
  businessType: z.string().max(50),
  industryType: z.string().max(50),
  establishedDate: z.string(),
  registrationNumber: z
    .string()
    .max(50, { error: "50文字以内で入力してください" }),
  invoiceNumber: z.string().max(20, { error: "20文字以内で入力してください" }),
  businessDescription: z
    .string()
    .max(2000, { error: "2000文字以内で入力してください" }),
});

export type BusinessInfoFormInput = z.infer<typeof businessInfoFormSchema>;

// =============================================================================
// Booking > 予約設定
// =============================================================================

export const reservationFormSchema = z.object({
  defaultTimeSlot: z.number().int().min(15).max(240),
  minReservationDuration: z.number().int().min(15).max(480),
  maxReservationDuration: z.number().int().min(60).max(1440),
  cancellationTermsId: z.string(),
});

export type ReservationFormInput = z.infer<typeof reservationFormSchema>;

// =============================================================================
// Booking > 割引設定
// =============================================================================

export const discountFormSchema = z.object({
  durationDiscountEnabled: z.boolean(),
  durationDiscountRules: z.array(
    z.object({
      hours: z.number().int().min(1).max(24),
      discountRate: z.number().min(1).max(100),
    }),
  ),
  discountCombinationMode: z.enum(DiscountCombinationMode),
  showOriginalPrice: z.boolean(),
  discountWarningEnabled: z.boolean(),
});

export type DiscountFormInput = z.infer<typeof discountFormSchema>;

// =============================================================================
// Integrations > Stripe
// =============================================================================

export const stripeFormSchema = z.object({
  stripeEnabled: z.boolean(),
  stripeTestMode: z.boolean(),
  stripePublishableKey: z.string(),
  stripeSecretKey: z.string(),
  stripeWebhookSecret: z.string(),
  stripeCurrency: z.enum(SUPPORTED_CURRENCY_VALUES),
});

export type StripeFormInput = z.infer<typeof stripeFormSchema>;

// =============================================================================
// Integrations > Resend
// =============================================================================

export const resendFormSchema = z.object({
  resendApiKey: z.string(),
});

export type ResendFormInput = z.infer<typeof resendFormSchema>;

// =============================================================================
// Integrations > Cloudflare
// =============================================================================

export const cloudflareFormSchema = z.object({
  cloudflareZoneId: z.string(),
  cloudflareApiToken: z.string(),
});

export type CloudflareFormInput = z.infer<typeof cloudflareFormSchema>;

// =============================================================================
// Integrations > Google Calendar
// =============================================================================

export const googleCalendarFormSchema = z.object({
  googleCalendarEnabled: z.boolean(),
  googleCalendarId: z.string(),
  serviceAccountJson: z.string(),
  icalAttachmentEnabled: z.boolean(),
  addToCalendarLinksEnabled: z.boolean(),
});

export type GoogleCalendarFormInput = z.infer<typeof googleCalendarFormSchema>;

// =============================================================================
// Integrations > 双方向同期
// =============================================================================

export const twoWaySyncFormSchema = z.object({
  enabled: z.boolean(),
  syncMethod: z.enum(CalendarSyncMethod),
  pollingIntervalMin: z.number().int().min(1).max(60),
});

export type TwoWaySyncFormInput = z.infer<typeof twoWaySyncFormSchema>;

// =============================================================================
// Integrations > Instagram フィード設定
// =============================================================================

export const instagramFeedFormSchema = z.object({
  feedEnabled: z.boolean(),
  feedLayout: z.enum(InstagramFeedLayout),
  feedColumns: z.number().int().min(2).max(6),
  feedMaxItems: z.number().int().min(1).max(24),
  showCaption: z.boolean(),
  showViewAll: z.boolean(),
});

export type InstagramFeedFormInput = z.infer<typeof instagramFeedFormSchema>;
