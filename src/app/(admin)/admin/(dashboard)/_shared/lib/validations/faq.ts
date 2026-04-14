/**
 * FAQ Validation Schemas
 *
 * FaqCategory と FaqItem の Zod バリデーションスキーマ
 */

import { z } from "zod";
import {
  seoOgpFieldsSchema,
  defaultSeoOgpValues,
} from "@/shared/lib/validations/seo";

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
  order: z.number().int().min(0),
  isActive: z.boolean(),
});

export type FaqCategoryFormInput = z.infer<typeof faqCategoryFormSchema>;

export const defaultFaqCategoryFormValues: FaqCategoryFormInput = {
  name: "",
  slug: "",
  description: null,
  iconEmoji: null,
  order: 0,
  isActive: true,
};

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

export const faqItemFormSchema = z
  .object({
    categoryId: z.string().uuid({ error: "カテゴリを選択してください" }),
    question: z
      .string()
      .min(1, { error: "質問を入力してください" })
      .max(500, { error: "質問は500文字以内で入力してください" }),
    answerJson: z
      .string()
      .min(1, { error: "回答を入力してください" })
      .max(500000, { error: "回答が大きすぎます" }),
    order: z.number().int().min(0),
    isPublished: z.boolean(),
  })
  .merge(seoOgpFieldsSchema);

export type FaqItemFormInput = z.infer<typeof faqItemFormSchema>;

export const defaultFaqItemFormValues: FaqItemFormInput = {
  categoryId: "",
  question: "",
  answerJson: "",
  order: 0,
  isPublished: true,
  ...defaultSeoOgpValues,
};
