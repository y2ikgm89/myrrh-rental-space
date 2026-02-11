import { z } from 'zod'
import { LayoutWidth } from '@/shared/types/prisma'
import { seoOgpFieldsSchema, seoOgpFieldsFormSchema } from '@/shared/lib/validations/seo'

// =============================================================================
// News Schemas
// =============================================================================

/**
 * スラッグのバリデーション
 */
export const newsSlugSchema = z
  .string()
  .min(1, { error: 'スラッグを入力してください' })
  .max(100, { error: 'スラッグは100文字以内で入力してください' })
  .regex(/^[a-z0-9-]+$/, { error: 'スラッグは小文字英数字とハイフンのみ使用可能です' })

/**
 * お知らせ作成スキーマ
 */
export const createNewsSchema = z.object({
  slug: newsSlugSchema,
  title: z.string().min(1, { error: 'タイトルは必須です' }).max(200, { error: 'タイトルは200文字以内で入力してください' }),
  content: z.string().default(''),
})

export type CreateNewsInput = z.infer<typeof createNewsSchema>

/**
 * お知らせ更新スキーマ
 */
export const updateNewsSchema = z
  .object({
    slug: newsSlugSchema,
    title: z.string().min(1, { error: 'タイトルは必須です' }).max(200, { error: 'タイトルは200文字以内で入力してください' }),
    content: z.string().min(1, { error: '本文は必須です' }),
    contentWidth: z.enum(LayoutWidth).nullable().optional(),
    contentWidthCustom: z.number().int().min(320).max(1920).nullable().optional(),
  })
  .merge(seoOgpFieldsSchema)

export type UpdateNewsInput = z.infer<typeof updateNewsSchema>

/**
 * お知らせフォームスキーマ（コンポーネント用）
 * 作成・編集両方で使用
 */
export const newsFormSchema = z
  .object({
    slug: newsSlugSchema,
    title: z.string().min(1, { error: 'タイトルは必須です' }).max(200, { error: 'タイトルは200文字以内で入力してください' }),
    content: z.string().min(1, { error: '本文は必須です' }),
    isPublished: z.boolean(),
    publishedAt: z.string().optional(),
    contentWidth: z.string().optional(),
    contentWidthCustom: z.string().optional(),
  })
  .merge(seoOgpFieldsFormSchema)

export type NewsFormData = z.infer<typeof newsFormSchema>

// =============================================================================
// News Data Types
// =============================================================================

/**
 * お知らせデータ型
 */
export type NewsData = {
  id: string
  slug: string
  title: string
  content: string
  isPublished: boolean
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
  contentWidth: LayoutWidth | null
  contentWidthCustom: number | null
  // SEO/OGP
  metaDescription: string | null
  metaKeywords: string | null
  ogpTitle: string | null
  ogpDescription: string | null
  ogpImageUrl: string | null
}

/**
 * お知らせバージョンデータ型
 */
export type NewsVersionData = {
  id: string
  newsId: string
  version: number
  content: string
  createdAt: Date
  createdBy: string | null
}

/**
 * お知らせ一覧取得結果型
 */
export type GetNewsListResult = {
  news: NewsData[]
  total: number
  page: number
  limit: number
  totalPages: number
}

/**
 * お知らせフィルター型
 */
export type NewsFilters = {
  status?: 'ALL' | 'PUBLISHED' | 'DRAFT'
  search?: string
}

/**
 * お知らせページネーション型
 */
export type NewsPagination = {
  page?: number
  limit?: number
  sortBy?: 'createdAt' | 'publishedAt'
  sortOrder?: 'asc' | 'desc'
}
