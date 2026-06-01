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

const tagsFormSchema = z.preprocess((v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.length > 0) {
    try {
      const parsed: unknown = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}, tagsSchema);

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

const publishedAtFormSchema = z
  .string()
  .datetime({ local: true })
  .or(z.literal(""))
  .nullable()
  .optional();

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
 *
 * Lexical contentJson + 派生 contentHtml。本文編集時に hidden input で transit、
 * submit handler 側で `renderEditorStateJsonToHtmlClient(contentJson)` 経由で
 * contentHtml を派生してから Server Action へ送信する。
 */
export const postBodyFormSchema = z.object({
  contentJson: lexicalJsonSchema,
  contentHtml: z.string().min(1, { error: "本文HTMLは必須です" }),
});

export type PostBodyFormData = z.infer<typeof postBodyFormSchema>;

/**
 * 投稿記事 設定フォームスキーマ（クライアント — SettingsDialog 専用）
 *
 * conform `parseWithZod`（FormData 経路）と既存テスト（object literal 経路）両対応の
 * in-place preprocess pattern。tags は JSON.stringify transit、contentWidth /
 * contentWidthCustom / publishedAt は string ↔ enum / number / datetime 変換。
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
    categoryId: z.string().uuid({ error: "カテゴリを選択してください" }),
    tags: tagsFormSchema,
    status: z.enum(PostStatus),
    publishedAt: publishedAtFormSchema,
    contentWidth: contentWidthFormSchema,
    contentWidthCustom: contentWidthCustomFormSchema,
  })
  .extend(seoOgpFieldsFormSchema.shape);

export type PostSettingsFormData = z.input<typeof postSettingsFormSchema>;

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
  // order はシステム管理（D&D 並び替えが SSoT、手動入力なし）
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
