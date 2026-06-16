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

/** analyticsType: フォームでは "none" を使い、送信時に null に変換する */
export const analyticsFormSchema = z.object({
  analyticsType: z.union([z.enum(AnalyticsType), z.literal("none")]),
  googleAnalyticsId: optionalText(50),
  googleTagManagerId: optionalText(50),
  gaPropertyId: optionalText(20),
  microsoftClarityId: optionalText(50),
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
