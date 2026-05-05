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
} from "@/shared/lib/validations/enums/prisma-types";
import {
  TIME_REGEX,
  collectBusinessHoursWeekIssues,
} from "@/shared/lib/validations/business-hours";

// =============================================================================
// Basic Schemas
// =============================================================================

export const basicInfoSchema = z.object({
  siteName: z
    .string()
    .max(100, { error: "サイト名は100文字以内で入力してください" })
    .nullable(),
  siteDescription: z
    .string()
    .max(500, { error: "サイト説明は500文字以内で入力してください" })
    .nullable(),
  faviconUrl: z
    .string()
    .max(500, { error: "ファビコンURLは500文字以内で入力してください" })
    .nullable(),
  defaultOgpImageUrl: z
    .string()
    .max(500, { error: "OGP画像URLは500文字以内で入力してください" })
    .nullable(),
  headerLogoUrl: z
    .string()
    .max(500, { error: "ヘッダーロゴURLは500文字以内で入力してください" })
    .nullable(),
  footerLogoUrl: z
    .string()
    .max(500, { error: "フッターロゴURLは500文字以内で入力してください" })
    .nullable(),
  footerCopyright: z
    .string()
    .max(200, { error: "コピーライトは200文字以内で入力してください" })
    .nullable(),
  useHeaderLogo: z.boolean(),
  useFooterLogo: z.boolean(),
});

export type BasicInfoInput = z.infer<typeof basicInfoSchema>;

// =============================================================================
// Business Schemas
// =============================================================================

export const businessInfoSchema = z.object({
  businessName: z
    .string()
    .max(100, { error: "事業者名は100文字以内で入力してください" })
    .nullable(),
  businessNameKana: z
    .string()
    .max(100, { error: "事業者名（カナ）は100文字以内で入力してください" })
    .nullable(),
  representativeName: z
    .string()
    .max(50, { error: "代表者名は50文字以内で入力してください" })
    .nullable(),
  businessType: z
    .string()
    .max(50, { error: "事業形態は50文字以内で入力してください" })
    .nullable(),
  industryType: z
    .string()
    .max(50, { error: "業種は50文字以内で入力してください" })
    .nullable(),
  establishedDate: z.string().nullable(),
  registrationNumber: z
    .string()
    .max(50, { error: "法人番号は50文字以内で入力してください" })
    .nullable(),
  invoiceNumber: z
    .string()
    .max(20, { error: "インボイス番号は20文字以内で入力してください" })
    .nullable(),
  businessDescription: z
    .string()
    .max(2000, { error: "事業内容は2000文字以内で入力してください" })
    .nullable(),
});

export type BusinessInfoInput = z.infer<typeof businessInfoSchema>;

export const contactInfoSchema = z.object({
  phoneNumber: z
    .string()
    .max(20, { error: "電話番号は20文字以内で入力してください" })
    .nullable(),
  faxNumber: z
    .string()
    .max(20, { error: "FAX番号は20文字以内で入力してください" })
    .nullable(),
  email: z
    .string()
    .email({ error: "有効なメールアドレスを入力してください" })
    .max(100, { error: "メールアドレスは100文字以内で入力してください" })
    .nullable()
    .or(z.literal("")),
  postalCode: z
    .string()
    .max(10, { error: "郵便番号は10文字以内で入力してください" })
    .nullable(),
  prefecture: z
    .string()
    .max(10, { error: "都道府県は10文字以内で入力してください" })
    .nullable(),
  city: z
    .string()
    .max(50, { error: "市区町村は50文字以内で入力してください" })
    .nullable(),
  streetAddress: z
    .string()
    .max(100, { error: "番地は100文字以内で入力してください" })
    .nullable(),
  buildingName: z
    .string()
    .max(100, { error: "建物名は100文字以内で入力してください" })
    .nullable(),
});

export type ContactInfoInput = z.infer<typeof contactInfoSchema>;

const timeSlotObjectSchema = z.object({
  openTime: z.string().regex(TIME_REGEX, {
    error: "正しい時刻形式（HH:mm）で入力してください",
  }),
  closeTime: z.string().regex(TIME_REGEX, {
    error: "正しい時刻形式（HH:mm）で入力してください",
  }),
});

const businessHoursDayObjectSchema = z.object({
  isOpen: z.boolean(),
  slots: z.array(timeSlotObjectSchema),
});

const businessHoursWeekSchema = z.object({
  monday: businessHoursDayObjectSchema,
  tuesday: businessHoursDayObjectSchema,
  wednesday: businessHoursDayObjectSchema,
  thursday: businessHoursDayObjectSchema,
  friday: businessHoursDayObjectSchema,
  saturday: businessHoursDayObjectSchema,
  sunday: businessHoursDayObjectSchema,
});

// 各日付は React key の stable ID として機能するため、重複を禁止する
const uniqueDateArraySchema = (label: string) =>
  z
    .array(z.string())
    .refine((arr) => new Set(arr).size === arr.length, {
      error: `同じ${label}を複数登録することはできません`,
    })
    .nullable();

export const businessHoursSettingsSchema = z
  .object({
    businessHours: businessHoursWeekSchema,
    regularHolidays: uniqueDateArraySchema("定休日"),
    specialHolidays: uniqueDateArraySchema("特別休業日"),
    // HTMLタグを禁止してXSS対策
    holidayNotice: z
      .string()
      .max(1000, { error: "お知らせは1000文字以内で入力してください" })
      .regex(/^[^<>]*$/, { error: "HTMLタグは使用できません" })
      .nullable()
      .or(z.literal(""))
      .transform((v) => v || null),
  })
  .superRefine((data, ctx) => {
    collectBusinessHoursWeekIssues(data.businessHours, ["businessHours"], ctx);
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

export const reservationSettingsSchema = z.object({
  defaultTimeSlot: z.number().int().min(15).max(240),
  minReservationDuration: z.number().int().min(15).max(480),
  maxReservationDuration: z.number().int().min(60).max(1440),
  cancellationDeadlineHours: z.number().int().min(1).max(720),
  modificationDeadlineHours: z.number().int().min(1).max(720),
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

// =============================================================================
// Reviews Feature Gate (multi-tenant global toggle)
// =============================================================================

export const reviewsGlobalSettingsSchema = z.object({
  reviewsEnabledGlobal: z.boolean(),
});

export type ReviewsGlobalSettingsInput = z.infer<
  typeof reviewsGlobalSettingsSchema
>;

// Re-export from validations for sidebar
export { sidebarSettingsSchema } from "@/shared/lib/validations/sidebar";

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
