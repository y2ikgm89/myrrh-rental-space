import { z } from 'zod'
import { LayoutWidth } from '@/shared/types/prisma'
import { BlogPostStatus } from '@/shared/generated/prisma/enums'

// =============================================================================
// Blog Post Schemas
// =============================================================================

/**
 * ブログ記事作成スキーマ
 */
export const createBlogPostSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内'),
  slug: z.string().min(1, 'スラッグは必須です').max(200).regex(/^[a-z0-9-]+$/, 'スラッグは小文字英数字とハイフンのみ'),
  excerpt: z.string().min(1, '抜粋は必須です').max(500, '抜粋は500文字以内'),
  content: z.string().default(''),
  thumbnailUrl: z.string().min(1, 'サムネイルURLは必須です'),
  ogpImageUrl: z.string().nullable().optional(),
  categoryId: z.string().uuid('カテゴリを選択してください'),
  tags: z.array(z.string()).default([]),
  metaDescription: z.string().max(160).nullable().optional(),
  metaKeywords: z.string().nullable().optional(),
  ogpTitle: z.string().max(60).nullable().optional(),
  ogpDescription: z.string().max(160).nullable().optional(),
})

export type CreateBlogPostInput = z.infer<typeof createBlogPostSchema>

/**
 * ブログ記事更新スキーマ
 */
export const updateBlogPostSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内'),
  slug: z.string().min(1, 'スラッグは必須です').max(200).regex(/^[a-z0-9-]+$/, 'スラッグは小文字英数字とハイフンのみ'),
  excerpt: z.string().min(1, '抜粋は必須です').max(500, '抜粋は500文字以内'),
  content: z.string().min(1, '本文は必須です'),
  thumbnailUrl: z.string().min(1, 'サムネイルURLは必須です'),
  ogpImageUrl: z.string().nullable().optional(),
  categoryId: z.string().uuid('カテゴリを選択してください'),
  tags: z.array(z.string()).default([]),
  metaDescription: z.string().max(160).nullable().optional(),
  metaKeywords: z.string().nullable().optional(),
  ogpTitle: z.string().max(60).nullable().optional(),
  ogpDescription: z.string().max(160).nullable().optional(),
  contentWidth: z.nativeEnum(LayoutWidth).nullable().optional(),
  contentWidthCustom: z.number().int().min(320).max(1920).nullable().optional(),
})

export type UpdateBlogPostInput = z.infer<typeof updateBlogPostSchema>

/**
 * ブログ記事フォームスキーマ（コンポーネント用）
 */
export const blogFormSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内'),
  slug: z.string().min(1, 'スラッグは必須です').max(200).regex(/^[a-z0-9-]+$/, 'スラッグは小文字英数字とハイフンのみ'),
  excerpt: z.string().min(1, '抜粋は必須です').max(500, '抜粋は500文字以内'),
  content: z.string().min(1, '本文は必須です'),
  thumbnailUrl: z.string().min(1, 'サムネイルURLは必須です'),
  ogpImageUrl: z.string().optional(),
  categoryId: z.string().min(1, 'カテゴリを選択してください'),
  tags: z.string().optional(),
  metaDescription: z.string().max(160).optional(),
  metaKeywords: z.string().optional(),
  ogpTitle: z.string().max(60).optional(),
  ogpDescription: z.string().max(160).optional(),
  status: z.nativeEnum(BlogPostStatus),
  publishedAt: z.string().optional(),
  contentWidth: z.string().optional(),
  contentWidthCustom: z.string().optional(),
})

export type BlogFormData = z.infer<typeof blogFormSchema>

// =============================================================================
// Blog Category Schemas
// =============================================================================

/**
 * ブログカテゴリスキーマ
 */
export const blogCategorySchema = z.object({
  name: z.string().min(1, 'カテゴリ名は必須です').max(50, 'カテゴリ名は50文字以内'),
  slug: z.string().min(1, 'スラッグは必須です').max(50).regex(/^[a-z0-9-]+$/, 'スラッグは小文字英数字とハイフンのみ'),
  description: z.string().max(200).nullable().optional(),
  order: z.number().int().min(0).default(0),
})

export type BlogCategoryInput = z.infer<typeof blogCategorySchema>

// =============================================================================
// Blog Data Types
// =============================================================================

/**
 * ブログ記事データ型
 */
export type BlogPostData = {
  id: string
  title: string
  slug: string
  excerpt: string
  content: string
  thumbnailUrl: string
  ogpImageUrl: string | null
  categoryId: string
  tags: string[]
  metaDescription: string | null
  metaKeywords: string | null
  ogpTitle: string | null
  ogpDescription: string | null
  publishedAt: Date | null
  status: BlogPostStatus
  viewCount: number
  createdAt: Date
  updatedAt: Date
  contentWidth: LayoutWidth | null
  contentWidthCustom: number | null
  category: {
    id: string
    name: string
    slug: string
  }
  author: {
    id: string
    name: string | null
    email: string
  }
}

/**
 * ブログ記事バージョンデータ型
 */
export type BlogPostVersionData = {
  id: string
  postId: string
  version: number
  content: string
  createdAt: Date
  createdBy: string | null
}

/**
 * ブログカテゴリデータ型
 */
export type BlogCategoryData = {
  id: string
  name: string
  slug: string
  description: string | null
  order: number
  createdAt: Date
  updatedAt: Date
  _count: {
    posts: number
  }
}

/**
 * ブログ記事一覧取得結果型
 */
export type GetBlogPostsResult = {
  posts: BlogPostData[]
  total: number
  page: number
  limit: number
  totalPages: number
}

/**
 * ブログ記事フィルター型
 */
export type BlogPostFilters = {
  status?: 'ALL' | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED'
  categoryId?: string
  search?: string
}

/**
 * ブログ記事ページネーション型
 */
export type BlogPostPagination = {
  page?: number
  limit?: number
  sortBy?: 'createdAt' | 'publishedAt' | 'viewCount'
  sortOrder?: 'asc' | 'desc'
}
