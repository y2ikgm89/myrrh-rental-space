import { z } from 'zod'
import { LayoutWidth } from '@/shared/types/prisma'

// =============================================================================
// News Schemas
// =============================================================================

/**
 * お知らせ作成スキーマ
 */
export const createNewsSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内で入力してください'),
  content: z.string().default(''),
})

export type CreateNewsInput = z.infer<typeof createNewsSchema>

/**
 * お知らせ更新スキーマ
 */
export const updateNewsSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内で入力してください'),
  content: z.string().min(1, '本文は必須です'),
  contentWidth: z.nativeEnum(LayoutWidth).nullable().optional(),
  contentWidthCustom: z.number().int().min(320).max(1920).nullable().optional(),
  // SEO フィールド
  metaDescription: z.string().max(300).nullable().optional(),
  metaKeywords: z.string().max(500).nullable().optional(),
  // OGP フィールド
  ogpTitle: z.string().max(100).nullable().optional(),
  ogpDescription: z.string().max(300).nullable().optional(),
  ogpImageUrl: z.string().url().nullable().optional(),
})

export type UpdateNewsInput = z.infer<typeof updateNewsSchema>

/**
 * お知らせフォームスキーマ（コンポーネント用）
 * 作成・編集両方で使用
 */
export const newsFormSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内で入力してください'),
  content: z.string().min(1, '本文は必須です'),
  isPublished: z.boolean(),
  publishedAt: z.string().optional(),
  contentWidth: z.string().optional(),
  contentWidthCustom: z.string().optional(),
  // SEO フィールド
  metaDescription: z.string().optional(),
  metaKeywords: z.string().optional(),
  // OGP フィールド
  ogpTitle: z.string().optional(),
  ogpDescription: z.string().optional(),
  ogpImageUrl: z.string().optional(),
})

export type NewsFormData = z.infer<typeof newsFormSchema>

// =============================================================================
// News Data Types
// =============================================================================

/**
 * お知らせデータ型
 */
export type NewsData = {
  id: string
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
