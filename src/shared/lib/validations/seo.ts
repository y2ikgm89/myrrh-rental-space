/**
 * SEO/OGP 共通バリデーションスキーマ
 *
 * @description 管理画面で使用するSEO/OGPフィールドの共通スキーマ
 * @see https://developers.google.com/search/docs/appearance/snippet
 * @see https://developers.facebook.com/docs/sharing/webmasters/
 */

import { z } from "zod";

// =============================================================================
// SEO/OGP 制限値（業界標準に基づく）
// =============================================================================

/**
 * SEO/OGP フィールドの文字数制限
 *
 * - metaDescription: Google は約155-160文字で切り捨て
 * - ogpTitle: Facebook は約60-70文字を推奨
 * - ogpDescription: Facebook は約200文字まで表示
 * - metaKeywords: 廃止傾向だが、使用する場合は適度な長さに
 */
export const SEO_LIMITS = {
  META_DESCRIPTION: 160,
  META_KEYWORDS: 500,
  OGP_TITLE: 70,
  OGP_DESCRIPTION: 200,
} as const;

// =============================================================================
// 基本スキーマ
// =============================================================================

/**
 * SEO フィールドスキーマ（Server Action用）
 */
export const seoFieldsSchema = z.object({
  metaDescription: z
    .string()
    .max(SEO_LIMITS.META_DESCRIPTION)
    .nullable()
    .optional(),
  metaKeywords: z.string().max(SEO_LIMITS.META_KEYWORDS).nullable().optional(),
});

/**
 * OGP フィールドスキーマ（Server Action用）
 */
export const ogpFieldsSchema = z.object({
  ogpTitle: z.string().max(SEO_LIMITS.OGP_TITLE).nullable().optional(),
  ogpDescription: z
    .string()
    .max(SEO_LIMITS.OGP_DESCRIPTION)
    .nullable()
    .optional(),
  ogpImageUrl: z.url().nullable().optional(),
});

/**
 * SEO/OGP 統合スキーマ（Server Action用）
 */
export const seoOgpFieldsSchema = z.object({
  ...seoFieldsSchema.shape,
  ...ogpFieldsSchema.shape,
});

// =============================================================================
// フォーム用スキーマ（optional で空文字許可）
// =============================================================================

/**
 * SEO フィールドスキーマ（フォーム用）
 */
export const seoFieldsFormSchema = z.object({
  metaDescription: z.string().max(SEO_LIMITS.META_DESCRIPTION).optional(),
  metaKeywords: z.string().max(SEO_LIMITS.META_KEYWORDS).optional(),
});

/**
 * OGP フィールドスキーマ（フォーム用）
 */
export const ogpFieldsFormSchema = z.object({
  ogpTitle: z.string().max(SEO_LIMITS.OGP_TITLE).optional(),
  ogpDescription: z.string().max(SEO_LIMITS.OGP_DESCRIPTION).optional(),
  ogpImageUrl: z.string().optional(),
});

/**
 * SEO/OGP 統合スキーマ（フォーム用）
 */
export const seoOgpFieldsFormSchema = z.object({
  ...seoFieldsFormSchema.shape,
  ...ogpFieldsFormSchema.shape,
});

// =============================================================================
// 型定義
// =============================================================================

export type SeoFields = z.infer<typeof seoFieldsSchema>;
export type OgpFields = z.infer<typeof ogpFieldsSchema>;
export type SeoOgpFields = z.infer<typeof seoOgpFieldsSchema>;
export type SeoFieldsForm = z.infer<typeof seoFieldsFormSchema>;
export type OgpFieldsForm = z.infer<typeof ogpFieldsFormSchema>;
export type SeoOgpFieldsForm = z.infer<typeof seoOgpFieldsFormSchema>;

// =============================================================================
// デフォルト値
// =============================================================================

export const defaultSeoOgpValues: SeoOgpFields = {
  metaDescription: null,
  metaKeywords: null,
  ogpTitle: null,
  ogpDescription: null,
  ogpImageUrl: null,
};

export const defaultSeoOgpFormValues: SeoOgpFieldsForm = {
  metaDescription: "",
  metaKeywords: "",
  ogpTitle: "",
  ogpDescription: "",
  ogpImageUrl: "",
};
