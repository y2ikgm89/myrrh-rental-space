import { z } from "zod";

// =============================================================================
// Base Schema
//
// conform `parseWithZod` 経由で FormData 文字列を受けるため、
// `order` は `z.coerce.number()`、optional 文字列は空文字を許容する設計。
// 空 → null 変換は Server Action の executor で行う（schema は文字列を通すだけ）。
// =============================================================================

const baseTaxonomySchema = z.object({
  name: z.string().min(1).max(50),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, { error: "スラッグは小文字英数字とハイフンのみ" }),
  description: z.string().max(500).optional(),
  metaTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(160).optional(),
  ogpImageUrl: z.string().max(2048).optional(),
});

// =============================================================================
// Category Schema
// =============================================================================

export const categoryFormSchema = baseTaxonomySchema.extend({
  name: z
    .string()
    .min(1, { error: "カテゴリ名は必須です" })
    .max(50, { error: "カテゴリ名は50文字以内" }),
  slug: z
    .string()
    .min(1, { error: "スラッグは必須です" })
    .max(50)
    .regex(/^[a-z0-9-]+$/, { error: "スラッグは小文字英数字とハイフンのみ" }),
  order: z.coerce
    .number({ error: "表示順は数値です" })
    .int()
    .min(0, { error: "表示順は0以上です" })
    .default(0),
});

export type CategoryFormData = z.infer<typeof categoryFormSchema>;

// =============================================================================
// Tag Schema
// =============================================================================

export const tagFormSchema = baseTaxonomySchema.extend({
  name: z
    .string()
    .min(1, { error: "タグ名は必須です" })
    .max(50, { error: "タグ名は50文字以内" }),
  slug: z
    .string()
    .min(1, { error: "スラッグは必須です" })
    .max(50)
    .regex(/^[a-z0-9-]+$/, { error: "スラッグは小文字英数字とハイフンのみ" }),
});

export type TagFormData = z.infer<typeof tagFormSchema>;
