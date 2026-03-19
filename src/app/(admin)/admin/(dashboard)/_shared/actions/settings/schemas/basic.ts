/**
 * 基本設定・ビジネス情報・SEO・レイアウト・その他設定のZodスキーマ
 */

import { z } from "zod";
import {
  LayoutWidth,
  AnalyticsType,
  HeaderScrollBehavior,
  HeaderBackgroundMode,
  PostPermalinkStructure,
} from "@/shared/db/enums";

// =============================================================================
// Basic Schemas
// =============================================================================

export const basicInfoSchema = z.object({
  siteName: z.string().max(100).nullable(),
  siteDescription: z.string().max(500).nullable(),
  faviconUrl: z.string().max(500).nullable(),
  defaultOgpImageUrl: z.string().max(500).nullable(),
  headerLogoUrl: z.string().max(500).nullable(),
  footerLogoUrl: z.string().max(500).nullable(),
  footerCopyright: z.string().max(200).nullable(),
  useHeaderLogo: z.boolean(),
  useFooterLogo: z.boolean(),
});

export type BasicInfoInput = z.infer<typeof basicInfoSchema>;

// =============================================================================
// Business Schemas
// =============================================================================

export const businessInfoSchema = z.object({
  businessName: z.string().max(100).nullable(),
  businessNameKana: z.string().max(100).nullable(),
  representativeName: z.string().max(50).nullable(),
  businessType: z.string().max(50).nullable(),
  industryType: z.string().max(50).nullable(),
  establishedDate: z.string().nullable(),
  registrationNumber: z.string().max(50).nullable(),
  invoiceNumber: z.string().max(20).nullable(),
  businessDescription: z.string().max(2000).nullable(),
});

export type BusinessInfoInput = z.infer<typeof businessInfoSchema>;

export const contactInfoSchema = z.object({
  phoneNumber: z.string().max(20).nullable(),
  faxNumber: z.string().max(20).nullable(),
  email: z.string().email().max(100).nullable().or(z.literal("")),
  address: z.string().max(500).nullable(),
  postalCode: z.string().max(10).nullable(),
  prefecture: z.string().max(10).nullable(),
  city: z.string().max(50).nullable(),
  streetAddress: z.string().max(100).nullable(),
  buildingName: z.string().max(100).nullable(),
});

export type ContactInfoInput = z.infer<typeof contactInfoSchema>;

// 時刻フォーマット: HH:mm（00:00-23:59）
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const timeSlotSchema = z
  .object({
    openTime: z.string().regex(TIME_REGEX, {
      error: "正しい時刻形式（HH:mm）で入力してください",
    }),
    closeTime: z.string().regex(TIME_REGEX, {
      error: "正しい時刻形式（HH:mm）で入力してください",
    }),
  })
  .refine((data) => data.closeTime > data.openTime, {
    error: "終了時刻は開始時刻より後にしてください",
    path: ["closeTime"],
  });

// 時間帯の重複チェック
function hasOverlappingSlots(
  slots: Array<{ openTime: string; closeTime: string }>,
): boolean {
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      if (!a || !b) continue;
      // 時間帯が重複している場合
      if (a.openTime < b.closeTime && a.closeTime > b.openTime) {
        return true;
      }
    }
  }
  return false;
}

export const businessHoursDaySchema = z
  .object({
    isOpen: z.boolean(),
    slots: z.array(timeSlotSchema),
  })
  .refine(
    (data) => {
      // 営業日なら最低1つの時間帯が必要
      if (data.isOpen && data.slots.length === 0) return false;
      return true;
    },
    { error: "営業日には最低1つの時間帯を設定してください" },
  )
  .refine(
    (data) => {
      if (!data.isOpen || data.slots.length <= 1) return true;
      return !hasOverlappingSlots(data.slots);
    },
    { error: "時間帯が重複しています" },
  );

// Note: refine後の型はZodEffectsになるため、基本スキーマを使用
const businessHoursDayBaseSchema = z.object({
  isOpen: z.boolean(),
  slots: z.array(
    z.object({
      openTime: z.string().regex(TIME_REGEX),
      closeTime: z.string().regex(TIME_REGEX),
    }),
  ),
});

const businessHoursWeekSchema = z.object({
  monday: businessHoursDayBaseSchema,
  tuesday: businessHoursDayBaseSchema,
  wednesday: businessHoursDayBaseSchema,
  thursday: businessHoursDayBaseSchema,
  friday: businessHoursDayBaseSchema,
  saturday: businessHoursDayBaseSchema,
  sunday: businessHoursDayBaseSchema,
});

export const businessHoursSettingsSchema = z.object({
  businessHours: businessHoursWeekSchema,
  regularHolidays: z.array(z.string()).nullable(),
  specialHolidays: z.array(z.string()).nullable(),
  // HTMLタグを禁止してXSS対策
  holidayNotice: z
    .string()
    .max(1000)
    .regex(/^[^<>]*$/, { error: "HTMLタグは使用できません" })
    .nullable()
    .or(z.literal(""))
    .transform((v) => v || null),
});

export type BusinessHoursSettingsInput = z.infer<
  typeof businessHoursSettingsSchema
>;

// =============================================================================
// SEO Schemas
// =============================================================================

export const metaSettingsSchema = z.object({
  defaultMetaDescription: z.string().max(160).nullable(),
  defaultMetaKeywords: z.string().max(500).nullable(),
  defaultOgpTitle: z.string().max(60).nullable(),
  defaultOgpDescription: z.string().max(160).nullable(),
});

export type MetaSettingsInput = z.infer<typeof metaSettingsSchema>;

export const analyticsSettingsSchema = z.object({
  analyticsType: z.enum(AnalyticsType).nullable(),
  googleAnalyticsId: z.string().max(50).nullable(),
  googleTagManagerId: z.string().max(50).nullable(),
  gaPropertyId: z.string().max(20).nullable(),
});

export type AnalyticsSettingsInput = z.infer<typeof analyticsSettingsSchema>;

export const searchVerificationSchema = z.object({
  googleSearchConsoleId: z.string().max(100).nullable(),
  bingWebmasterToolsId: z.string().max(100).nullable(),
});

export type SearchVerificationInput = z.infer<typeof searchVerificationSchema>;

// =============================================================================
// Layout Schemas
// =============================================================================

export const layoutSettingsSchema = z.object({
  containerWidth: z.enum(LayoutWidth),
  containerWidthCustom: z.number().int().min(320).max(2560).nullable(),
  contentWidth: z.enum(LayoutWidth),
  contentWidthCustom: z.number().int().min(320).max(1920).nullable(),
});

export const headerSettingsSchema = z.object({
  headerScrollBehavior: z.enum(HeaderScrollBehavior),
  headerBackgroundMode: z.enum(HeaderBackgroundMode),
});

export type HeaderSettingsInput = z.infer<typeof headerSettingsSchema>;

export const footerSettingsSchema = z.object({
  footerTagline: z
    .string()
    .max(200, { error: "200文字以内で入力してください" })
    .nullable(),
  footerNavigationLabel: z
    .string()
    .min(1, { error: "必須です" })
    .max(50, { error: "50文字以内で入力してください" }),
  footerContactLabel: z
    .string()
    .min(1, { error: "必須です" })
    .max(50, { error: "50文字以内で入力してください" }),
  footerHoursLabel: z
    .string()
    .min(1, { error: "必須です" })
    .max(50, { error: "50文字以内で入力してください" }),
  footerShowSocialLinks: z.boolean(),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, {
    error: "有効なHEXカラーコードを入力してください",
  }),
});

export type FooterSettingsInput = z.infer<typeof footerSettingsSchema>;

export type LayoutSettingsInput = z.infer<typeof layoutSettingsSchema>;

// =============================================================================
// Other Schemas
// =============================================================================

export const maintenanceSettingsSchema = z.object({
  maintenanceMode: z.boolean(),
  maintenanceMessage: z.string().max(1000).nullable(),
});

export type MaintenanceSettingsInput = z.infer<
  typeof maintenanceSettingsSchema
>;

export const cookieConsentSettingsSchema = z.object({
  cookieConsentEnabled: z.boolean(),
  cookieConsentMessage: z.string().max(1000).nullable(),
  cookieConsentAcceptText: z.string().max(50).nullable(),
  cookieConsentRejectText: z.string().max(50).nullable(),
  cookieConsentPolicyUrl: z.string().max(200).nullable(),
});

export type CookieConsentSettingsInput = z.infer<
  typeof cookieConsentSettingsSchema
>;

export const termsAgreementSettingsSchema = z.object({
  termsAgreementEnabled: z.boolean(),
  termsAgreementText: z.string().max(500).nullable(),
  requireTermsAgreement: z.boolean(),
  requirePrivacyAgreement: z.boolean(),
});

export type TermsAgreementSettingsInput = z.infer<
  typeof termsAgreementSettingsSchema
>;

export const reservationSettingsSchema = z.object({
  defaultTimeSlot: z.number().int().min(15).max(240).nullable(),
  minReservationDuration: z.number().int().min(15).max(480).nullable(),
  maxReservationDuration: z.number().int().min(60).max(1440).nullable(),
  cancellationTermsId: z.string().uuid().nullable(),
});

export type ReservationSettingsInput = z.infer<
  typeof reservationSettingsSchema
>;

// =============================================================================
// Permalink Schemas
// =============================================================================

export const permalinkSettingsSchema = z.object({
  postPermalinkStructure: z.enum(PostPermalinkStructure),
  postUrlPrefixEnabled: z.boolean(),
});

export type PermalinkSettingsInput = z.infer<typeof permalinkSettingsSchema>;

// Re-export from validations for sidebar
export {
  sidebarSettingsSchema,
  type SidebarSettings as SidebarSettingsInput,
} from "@/shared/lib/validations/sidebar";

// =============================================================================
// MEO Schemas (ローカル検索最適化)
// =============================================================================

export const meoSettingsSchema = z.object({
  latitude: z
    .number()
    .min(-90, { error: "緯度は-90〜90の範囲で入力してください" })
    .max(90, { error: "緯度は-90〜90の範囲で入力してください" })
    .nullable(),
  longitude: z
    .number()
    .min(-180, { error: "経度は-180〜180の範囲で入力してください" })
    .max(180, { error: "経度は-180〜180の範囲で入力してください" })
    .nullable(),
  priceRange: z
    .string()
    .max(100, { error: "価格帯は100文字以内で入力してください" })
    .nullable(),
  googleBusinessPlaceId: z
    .string()
    .max(200, { error: "Place IDは200文字以内で入力してください" })
    .nullable(),
  googleReviewUrl: z
    .string()
    .url({ error: "有効なURLを入力してください" })
    .max(500, { error: "URLは500文字以内で入力してください" })
    .nullable()
    .or(z.literal("")),
  businessAttributes: z.record(z.string(), z.boolean()).nullable(),
  paymentAccepted: z
    .string()
    .max(500, { error: "決済方法は500文字以内で入力してください" })
    .nullable()
    .or(z.literal("")),
});

export type MeoSettingsInput = z.infer<typeof meoSettingsSchema>;

// robots.txt

export const robotsTxtSettingsSchema = z.object({
  robotsTxtEnabled: z.boolean(),
  robotsTxtCustom: z
    .string()
    .max(10000, { error: "robots.txtは10000文字以内で入力してください" })
    .nullable(),
});

export type RobotsTxtSettingsInput = z.infer<typeof robotsTxtSettingsSchema>;

export function checkRobotsTxtWarnings(content: string): string[] {
  const warnings: string[] = [];
  const lines = content.split("\n").map((line) => line.trim().toLowerCase());

  let hasWildcardUserAgent = false;
  for (const line of lines) {
    if (line.startsWith("user-agent:") && line.includes("*")) {
      hasWildcardUserAgent = true;
    }
    if (hasWildcardUserAgent && line === "disallow: /") {
      warnings.push("この設定はサイト全体が検索結果から除外されます");
      break;
    }
  }

  if (!lines.some((line) => line.startsWith("sitemap:"))) {
    warnings.push("Sitemapが指定されていません（推奨）");
  }

  return warnings;
}
