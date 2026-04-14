import { z } from "zod";
import { LayoutWidth } from "@/shared/lib/validations/enums/prisma-types";
import {
  seoOgpFieldsSchema,
  seoOgpFieldsFormSchema,
} from "@/shared/lib/validations/seo";
import { lexicalJsonSchema } from "@/shared/lib/validations/lexical";

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
  .merge(seoOgpFieldsSchema);

export type UpdateNewsSettingsInput = z.infer<typeof updateNewsSettingsSchema>;

/**
 * お知らせ 本文フォームスキーマ（クライアント）
 */
export const newsBodyFormSchema = z.object({
  contentJson: z.string().min(1, { error: "本文は必須です" }),
});

export type NewsBodyFormData = z.infer<typeof newsBodyFormSchema>;

/**
 * お知らせ 設定フォームスキーマ（クライアント — SettingsDialog 専用）
 */
export const newsSettingsFormSchema = z
  .object({
    slug: newsSlugSchema,
    title: z
      .string()
      .min(1, { error: "タイトルは必須です" })
      .max(200, { error: "タイトルは200文字以内で入力してください" }),
    isPublished: z.boolean(),
    publishedAt: z.string().optional(),
    contentWidth: z.string().optional(),
    contentWidthCustom: z.string().optional(),
  })
  .merge(seoOgpFieldsFormSchema);

export type NewsSettingsFormData = z.infer<typeof newsSettingsFormSchema>;
