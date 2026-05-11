import { z } from "zod";
import {
  LayoutWidth,
  PostStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  seoOgpFieldsSchema,
  seoOgpFieldsFormSchema,
} from "@/shared/lib/validations/seo";
import { lexicalJsonSchema } from "@/shared/lib/validations/lexical";

// タグ ID は React key として使われるため、重複を禁止する
const tagsSchema = z
  .array(z.string().uuid({ error: "タグIDが不正です" }))
  .refine((ids) => new Set(ids).size === ids.length, {
    error: "同じタグを複数選択することはできません",
  })
  .default([]);

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
    contentJson: lexicalJsonSchema,
    contentHtml: z.string().min(1, { error: "本文HTMLは必須です" }),
    thumbnailUrl: z.string().min(1, { error: "サムネイルURLは必須です" }),
    categoryId: z.string().uuid({ error: "カテゴリを選択してください" }),
    tags: tagsSchema,
  })
  .extend(seoOgpFieldsSchema.shape);

export type CreatePostInput = z.infer<typeof createPostSchema>;

/**
 * 投稿記事 本文更新スキーマ（Server Action）
 */
export const updatePostBodySchema = z.object({
  contentJson: lexicalJsonSchema,
  contentHtml: z.string().min(1, { error: "本文HTMLは必須です" }),
});

export type UpdatePostBodyInput = z.infer<typeof updatePostBodySchema>;

/**
 * 投稿記事 設定更新スキーマ（Server Action）
 *
 * 本文（contentJson / contentHtml）以外のメタデータをまとめて更新する。
 */
export const updatePostSettingsSchema = z
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
    thumbnailUrl: z.string().min(1, { error: "サムネイルURLは必須です" }),
    categoryId: z.string().uuid({ error: "カテゴリを選択してください" }),
    tags: tagsSchema,
    status: z.enum(PostStatus),
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

export type UpdatePostSettingsInput = z.infer<typeof updatePostSettingsSchema>;

/**
 * 投稿記事 本文フォームスキーマ（クライアント）
 */
export const postBodyFormSchema = z.object({
  contentJson: z.string().min(1, { error: "本文は必須です" }),
});

export type PostBodyFormData = z.infer<typeof postBodyFormSchema>;

/**
 * 投稿記事 設定フォームスキーマ（クライアント — SettingsDialog 専用）
 */
export const postSettingsFormSchema = z
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
    thumbnailUrl: z.string().min(1, { error: "サムネイルURLは必須です" }),
    categoryId: z.string().min(1, { error: "カテゴリを選択してください" }),
    tags: z.string().optional(),
    status: z.enum(PostStatus),
    publishedAt: z.string().optional(),
    contentWidth: z.string().optional(),
    contentWidthCustom: z.string().optional(),
  })
  .extend(seoOgpFieldsFormSchema.shape);

export type PostSettingsFormData = z.infer<typeof postSettingsFormSchema>;

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
