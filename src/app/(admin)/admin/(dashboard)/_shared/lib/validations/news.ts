import { z } from "zod";
import { LayoutWidth } from "@/shared/db/enums";
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
 * お知らせ更新スキーマ
 */
export const updateNewsSchema = z
  .object({
    slug: newsSlugSchema,
    title: z
      .string()
      .min(1, { error: "タイトルは必須です" })
      .max(200, { error: "タイトルは200文字以内で入力してください" }),
    contentJson: lexicalJsonSchema,
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

export type UpdateNewsInput = z.infer<typeof updateNewsSchema>;

/**
 * お知らせフォームスキーマ（コンポーネント用）
 * 作成・編集両方で使用
 */
export const newsFormSchema = z
  .object({
    slug: newsSlugSchema,
    title: z
      .string()
      .min(1, { error: "タイトルは必須です" })
      .max(200, { error: "タイトルは200文字以内で入力してください" }),
    contentJson: z.string().min(1, { error: "本文は必須です" }),
    isPublished: z.boolean(),
    publishedAt: z.string().optional(),
    contentWidth: z.string().optional(),
    contentWidthCustom: z.string().optional(),
  })
  .merge(seoOgpFieldsFormSchema);

export type NewsFormData = z.infer<typeof newsFormSchema>;
