/**
 * FAQ Validation Schemas
 *
 * FaqCategory と FaqItem の Zod バリデーションスキーマ
 */

import { z } from 'zod'
import { seoOgpFieldsSchema, defaultSeoOgpValues } from '@/shared/lib/validations/seo'

// =============================================================================
// FaqCategory Schemas
// =============================================================================

export const faqCategoryFormSchema = z.object({
  name: z
    .string()
    .min(1, { error: 'カテゴリ名を入力してください' })
    .max(100, { error: 'カテゴリ名は100文字以内で入力してください' }),
  slug: z
    .string()
    .min(1, { error: 'スラッグを入力してください' })
    .max(100, { error: 'スラッグは100文字以内で入力してください' })
    .regex(
      /^[a-z0-9-]+$/,
      { error: 'スラッグは半角英数字とハイフンのみ使用できます' }
    ),
  description: z
    .string()
    .max(500, { error: '説明は500文字以内で入力してください' })
    .nullable()
    .optional(),
  order: z.number().int().min(0),
  isActive: z.boolean(),
})

export type FaqCategoryFormInput = z.infer<typeof faqCategoryFormSchema>

export const defaultFaqCategoryFormValues: FaqCategoryFormInput = {
  name: '',
  slug: '',
  description: null,
  order: 0,
  isActive: true,
}

// =============================================================================
// FaqItem Schemas
// =============================================================================

export const faqItemFormSchema = z
  .object({
    categoryId: z.string().uuid({ error: 'カテゴリを選択してください' }),
    question: z
      .string()
      .min(1, { error: '質問を入力してください' })
      .max(500, { error: '質問は500文字以内で入力してください' }),
    answerJson: z
      .string()
      .min(1, { error: '回答を入力してください' })
      .max(500000, { error: '回答が大きすぎます' }),
    order: z.number().int().min(0),
    isPublished: z.boolean(),
  })
  .merge(seoOgpFieldsSchema)

export type FaqItemFormInput = z.infer<typeof faqItemFormSchema>

export const defaultFaqItemFormValues: FaqItemFormInput = {
  categoryId: '',
  question: '',
  answerJson: '',
  order: 0,
  isPublished: true,
  ...defaultSeoOgpValues,
}

// =============================================================================
// Response Types
// =============================================================================

export type FaqCategoryWithItems = {
  id: string
  name: string
  slug: string
  description: string | null
  order: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  items: FaqItemData[]
}

export type FaqItemData = {
  id: string
  categoryId: string
  question: string
  answerHtml: string
  answerJson: unknown
  order: number
  isPublished: boolean
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
  // SEO/OGP
  metaDescription: string | null
  metaKeywords: string | null
  ogpTitle: string | null
  ogpDescription: string | null
  ogpImageUrl: string | null
}

export type FaqItemWithCategory = FaqItemData & {
  category: {
    id: string
    name: string
    slug: string
  }
}
