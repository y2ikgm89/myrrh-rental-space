/**
 * FAQ Validation Schemas
 *
 * FaqCategory と FaqItem の Zod バリデーションスキーマ。
 * `@conform-to/zod/v4` の `parseWithZod` は `z.number()` / `z.boolean()` に対し
 * FormData 文字列を自動 coerce する（"on"→true / ""→false / "5"→5）ため、
 * schema 側で `.coerce.*` を使う必要はない（使うと input 型が `unknown` 化して
 * `useInputControl` の `Value extends string` 制約に違反する）。
 * - nullable 文字列は空文字許容（"" → null 変換は Server Action executor で実施）
 */

import { z } from "zod";

// =============================================================================
// FaqCategory Schemas
// =============================================================================

export const faqCategoryFormSchema = z.object({
  name: z
    .string()
    .min(1, { error: "カテゴリ名を入力してください" })
    .max(100, { error: "カテゴリ名は100文字以内で入力してください" }),
  slug: z
    .string()
    .min(1, { error: "スラッグを入力してください" })
    .max(100, { error: "スラッグは100文字以内で入力してください" })
    .regex(/^[a-z0-9-]+$/, {
      error: "スラッグは半角英数字とハイフンのみ使用できます",
    }),
  description: z
    .string()
    .max(500, { error: "説明は500文字以内で入力してください" })
    .nullable()
    .optional(),
  iconEmoji: z
    .string()
    .max(8, { error: "アイコンは1文字の絵文字を入力してください" })
    .nullable()
    .optional(),
  isActive: z.boolean().default(false),
});

export type FaqCategoryFormInput = z.infer<typeof faqCategoryFormSchema>;

// ============================================================================
// Bulk operations schemas
// ============================================================================

export const bulkFaqItemIdsSchema = z
  .array(z.string().uuid({ error: "IDが不正です" }))
  .min(1, { error: "対象を選択してください" })
  .refine((ids) => new Set(ids).size === ids.length, {
    error: "同じIDを複数指定することはできません",
  });

export const bulkMoveFaqItemsSchema = z.object({
  ids: bulkFaqItemIdsSchema,
  newCategoryId: z.string().uuid({ error: "移動先カテゴリを選択してください" }),
});

export type BulkMoveFaqItemsInput = z.infer<typeof bulkMoveFaqItemsSchema>;

// =============================================================================
// FaqItem Schemas
// =============================================================================

export const faqItemFormSchema = z.object({
  categoryId: z.string().uuid({ error: "カテゴリを選択してください" }),
  question: z
    .string()
    .min(1, { error: "質問を入力してください" })
    .max(500, { error: "質問は500文字以内で入力してください" }),
  answer: z
    .string()
    .min(1, { error: "回答を入力してください" })
    .max(5000, { error: "回答は5000文字以内で入力してください" }),
  isPublished: z.boolean().default(false),
});

export type FaqItemFormInput = z.infer<typeof faqItemFormSchema>;
