import { z } from "zod";
import { LayoutWidth, PostStatus } from "@/shared/db/enums";
import {
  seoOgpFieldsSchema,
  seoOgpFieldsFormSchema,
} from "@/shared/lib/validations/seo";
import { lexicalJsonSchema } from "@/shared/lib/validations/lexical";

// =============================================================================
// Post Schemas
// =============================================================================

/**
 * 投稿記事作成スキーマ
 */
export const createPostSchema = z
  .object({
    title: z
      .string()
      .min(1, { error: "タイトルは必須です" })
      .max(200, { error: "タイトルは200文字以内" }),
    slug: z
      .string()
      .min(1, { error: "スラッグは必須です" })
      .max(200)
      .regex(/^[a-z0-9-]+$/, { error: "スラッグは小文字英数字とハイフンのみ" }),
    excerpt: z
      .string()
      .min(1, { error: "抜粋は必須です" })
      .max(500, { error: "抜粋は500文字以内" }),
    contentJson: z.string().default(""),
    thumbnailUrl: z.string().min(1, { error: "サムネイルURLは必須です" }),
    categoryId: z.string().uuid({ error: "カテゴリを選択してください" }),
    tags: z.array(z.string().uuid({ error: "タグIDが不正です" })).default([]),
  })
  .merge(seoOgpFieldsSchema);

export type CreatePostInput = z.infer<typeof createPostSchema>;

/**
 * 投稿記事更新スキーマ
 */
export const updatePostSchema = z
  .object({
    title: z
      .string()
      .min(1, { error: "タイトルは必須です" })
      .max(200, { error: "タイトルは200文字以内" }),
    slug: z
      .string()
      .min(1, { error: "スラッグは必須です" })
      .max(200)
      .regex(/^[a-z0-9-]+$/, { error: "スラッグは小文字英数字とハイフンのみ" }),
    excerpt: z
      .string()
      .min(1, { error: "抜粋は必須です" })
      .max(500, { error: "抜粋は500文字以内" }),
    contentJson: lexicalJsonSchema,
    thumbnailUrl: z.string().min(1, { error: "サムネイルURLは必須です" }),
    categoryId: z.string().uuid({ error: "カテゴリを選択してください" }),
    tags: z.array(z.string().uuid({ error: "タグIDが不正です" })).default([]),
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

export type UpdatePostInput = z.infer<typeof updatePostSchema>;

/**
 * 投稿記事フォームスキーマ（コンポーネント用）
 */
export const postFormSchema = z
  .object({
    title: z
      .string()
      .min(1, { error: "タイトルは必須です" })
      .max(200, { error: "タイトルは200文字以内" }),
    slug: z
      .string()
      .min(1, { error: "スラッグは必須です" })
      .max(200)
      .regex(/^[a-z0-9-]+$/, { error: "スラッグは小文字英数字とハイフンのみ" }),
    excerpt: z
      .string()
      .min(1, { error: "抜粋は必須です" })
      .max(500, { error: "抜粋は500文字以内" }),
    contentJson: z.string().min(1, { error: "本文は必須です" }),
    thumbnailUrl: z.string().min(1, { error: "サムネイルURLは必須です" }),
    categoryId: z.string().min(1, { error: "カテゴリを選択してください" }),
    tags: z.string().optional(),
    status: z.enum(PostStatus),
    publishedAt: z.string().optional(),
    contentWidth: z.string().optional(),
    contentWidthCustom: z.string().optional(),
  })
  .merge(seoOgpFieldsFormSchema);

export type PostFormData = z.infer<typeof postFormSchema>;

// =============================================================================
// Post Category Schemas
// =============================================================================

/**
 * 投稿カテゴリスキーマ（SEO/OGP含む）
 */
export const postCategorySchema = z.object({
  name: z
    .string()
    .min(1, { error: "カテゴリ名は必須です" })
    .max(50, { error: "カテゴリ名は50文字以内" }),
  slug: z
    .string()
    .min(1, { error: "スラッグは必須です" })
    .max(50)
    .regex(/^[a-z0-9-]+$/, { error: "スラッグは小文字英数字とハイフンのみ" }),
  description: z.string().max(500).nullable().optional(),
  order: z.number().int().min(0).default(0),
  metaTitle: z.string().max(70).nullable().optional(),
  metaDescription: z.string().max(160).nullable().optional(),
  ogpImageUrl: z
    .string()
    .url()
    .nullable()
    .optional()
    .or(z.literal(""))
    .or(z.literal(null)),
});

export type PostCategoryInput = z.infer<typeof postCategorySchema>;

// =============================================================================
// Post Tag Schemas
// =============================================================================

/**
 * 投稿タグスキーマ（SEO/OGP含む）
 */
export const postTagSchema = z.object({
  name: z
    .string()
    .min(1, { error: "タグ名は必須です" })
    .max(50, { error: "タグ名は50文字以内" }),
  slug: z
    .string()
    .min(1, { error: "スラッグは必須です" })
    .max(50)
    .regex(/^[a-z0-9-]+$/, { error: "スラッグは小文字英数字とハイフンのみ" }),
  description: z.string().max(500).nullable().optional(),
  metaTitle: z.string().max(70).nullable().optional(),
  metaDescription: z.string().max(160).nullable().optional(),
  ogpImageUrl: z
    .string()
    .url()
    .nullable()
    .optional()
    .or(z.literal(""))
    .or(z.literal(null)),
});

export type PostTagInput = z.infer<typeof postTagSchema>;
