/**
 * 設定セクション用フォームスキーマ — SEO・分析・MEO
 */
import { z } from "zod";
import { AnalyticsType } from "@/shared/lib/validations/enums/prisma-types";
import { optionalText } from "./form-schema-helpers";

// =============================================================================
// Site > SEO > メタ情報
// =============================================================================

export const metaFormSchema = z.object({
  defaultMetaDescription: optionalText(160),
  defaultMetaKeywords: optionalText(500),
  defaultOgpTitle: optionalText(60),
  defaultOgpDescription: optionalText(160),
});

export type MetaFormInput = z.infer<typeof metaFormSchema>;

// =============================================================================
// Site > SEO > Analytics設定
// =============================================================================

const googleAnalyticsMeasurementId = z
  .string()
  .trim()
  .regex(/^G-[A-Z0-9]+$/u, {
    error: "Google Analytics 測定 ID は G- で始まる英数字で入力してください",
  })
  .max(50, { error: "50文字以内で入力してください" })
  .optional();

const googleTagManagerContainerId = z
  .string()
  .trim()
  .regex(/^GTM-[A-Z0-9]+$/u, {
    error: "Google Tag Manager ID は GTM- で始まる英数字で入力してください",
  })
  .max(50, { error: "50文字以内で入力してください" })
  .optional();

const gaPropertyId = z
  .string()
  .trim()
  .regex(/^[0-9]+$/u, {
    error: "GA4 プロパティ ID は数字のみで入力してください",
  })
  .max(20, { error: "20文字以内で入力してください" })
  .optional();

const microsoftClarityProjectId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]+$/u, {
    error: "Microsoft Clarity Project ID は英数字で入力してください",
  })
  .max(50, { error: "50文字以内で入力してください" })
  .optional();

/** analyticsType: フォームでは "none" を使い、送信時に null に変換する */
export const analyticsFormSchema = z.object({
  analyticsType: z.union([z.enum(AnalyticsType), z.literal("none")]),
  googleAnalyticsId: googleAnalyticsMeasurementId,
  googleTagManagerId: googleTagManagerContainerId,
  gaPropertyId,
  microsoftClarityId: microsoftClarityProjectId,
});

export type AnalyticsFormInput = z.infer<typeof analyticsFormSchema>;

// =============================================================================
// Site > SEO > 検索エンジン検証
// =============================================================================

export const searchVerificationFormSchema = z.object({
  googleSearchConsoleId: optionalText(100),
  bingWebmasterToolsId: optionalText(100),
});

export type SearchVerificationFormInput = z.infer<
  typeof searchVerificationFormSchema
>;
