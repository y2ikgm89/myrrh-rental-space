/**
 * 設定セクション用フォームスキーマ — SEO・分析・MEO
 */
import { z } from "zod";
import { AnalyticsType } from "@/shared/lib/validations/enums/prisma-types";

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
