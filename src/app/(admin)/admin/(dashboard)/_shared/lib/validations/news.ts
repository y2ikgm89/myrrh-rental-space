import { z } from "zod";
import { LayoutWidth } from "@/shared/lib/validations/enums/prisma-types";
import {
  seoOgpFieldsSchema,
  seoOgpFieldsFormSchema,
} from "@/shared/lib/validations/seo";
import { lexicalJsonSchema } from "@/shared/lib/validations/lexical";

const contentWidthFormSchema = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return null;
  if (typeof v === "string") {
    return v in LayoutWidth ? v : null;
  }
  return null;
}, z.enum(LayoutWidth).nullable().optional());

const contentWidthCustomFormSchema = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}, z.number().int().min(320).max(1920).nullable().optional());

const publishedAtFormSchema = z.iso
  .datetime({ local: true })
  .or(z.literal(""))
  .nullable()
  .optional();

const isPublishedFormSchema = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "on" || v === "true";
  return false;
}, z.boolean().default(false));

// =============================================================================
// News Schemas
// =============================================================================

/**
 * スラッグのバリデーション
 */
export const newsSlugSchema = z
  .string()
  .min(1, { error: "スラッグを入力してください" })
  .max(100, { error: "スラッグは100文字以内で入力してください" })
  .regex(/^[a-z0-9-]+$/, {
    error: "スラッグは小文字英数字とハイフンのみ使用可能です",
  });

/**
 * お知らせ作成スキーマ
 */
export const createNewsSchema = z.object({
  slug: newsSlugSchema,
  title: z
    .string()
    .min(1, { error: "タイトルは必須です" })
    .max(200, { error: "タイトルは200文字以内で入力してください" }),
  contentJson: lexicalJsonSchema,
});

export type CreateNewsInput = z.infer<typeof createNewsSchema>;

/**
 * お知らせ 本文更新スキーマ（Server Action）
 */
export const updateNewsBodySchema = z.object({
  contentJson: lexicalJsonSchema,
});

export type UpdateNewsBodyInput = z.infer<typeof updateNewsBodySchema>;

/**
 * お知らせ 設定更新スキーマ（Server Action）
 */
export const updateNewsSettingsSchema = z
  .object({
    slug: newsSlugSchema,
    title: z
      .string()
      .min(1, { error: "タイトルは必須です" })
      .max(200, { error: "タイトルは200文字以内で入力してください" }),
    isPublished: z.boolean(),
    contentWidth: z.enum(LayoutWidth).nullable().optional(),
    contentWidthCustom: z
      .number()
      .int()
      .min(320)
      .max(1920)
      .nullable()
      .optional(),
  })
  .extend(seoOgpFieldsSchema.shape);

export type UpdateNewsSettingsInput = z.infer<typeof updateNewsSettingsSchema>;

/**
 * お知らせ 本文フォームスキーマ（クライアント）
 *
 * Lexical contentJson のみ transit。contentHtml は server が JSON から派生する。
 */
export const newsBodyFormSchema = z.object({
  contentJson: lexicalJsonSchema,
});

export type NewsBodyFormData = z.infer<typeof newsBodyFormSchema>;

/**
 * お知らせ 設定フォームスキーマ（クライアント — SettingsDialog 専用）
 *
 * conform `parseWithZod`（FormData 経路）と既存テスト（object literal 経路）両対応の
 * in-place preprocess pattern。isPublished は checkbox value "on"/"true" を boolean に
 * 変換、contentWidth / contentWidthCustom / publishedAt は string ↔ enum / number /
 * datetime 変換。
 */
export const newsSettingsFormSchema = z
  .object({
    slug: newsSlugSchema,
    title: z
      .string()
      .min(1, { error: "タイトルは必須です" })
      .max(200, { error: "タイトルは200文字以内で入力してください" }),
    isPublished: isPublishedFormSchema,
    publishedAt: publishedAtFormSchema,
    contentWidth: contentWidthFormSchema,
    contentWidthCustom: contentWidthCustomFormSchema,
  })
  .extend(seoOgpFieldsFormSchema.shape);

export type NewsSettingsFormData = z.input<typeof newsSettingsFormSchema>;
