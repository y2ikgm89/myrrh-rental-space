import { z } from 'zod'
import { LayoutWidth } from '@/shared/types/prisma'
import { PostStatus } from '@/shared/generated/prisma/enums'
import { seoOgpFieldsSchema, seoOgpFieldsFormSchema } from '@/shared/lib/validations/seo'

// =============================================================================
// Post Schemas
// =============================================================================

/**
 * 投稿記事作成スキーマ
 */
export const createPostSchema = z
  .object({
    title: z.string().min(1, { error: 'タイトルは必須です' }).max(200, { error: 'タイトルは200文字以内' }),
    slug: z.string().min(1, { error: 'スラッグは必須です' }).max(200).regex(/^[a-z0-9-]+$/, { error: 'スラッグは小文字英数字とハイフンのみ' }),
    excerpt: z.string().min(1, { error: '抜粋は必須です' }).max(500, { error: '抜粋は500文字以内' }),
    content: z.string().default(''),
    thumbnailUrl: z.string().min(1, { error: 'サムネイルURLは必須です' }),
    categoryId: z.string().uuid({ error: 'カテゴリを選択してください' }),
    tags: z.array(z.string()).default([]),
  })
  .merge(seoOgpFieldsSchema)

export type CreatePostInput = z.infer<typeof createPostSchema>

/**
 * 投稿記事更新スキーマ
 */
export const updatePostSchema = z
  .object({
    title: z.string().min(1, { error: 'タイトルは必須です' }).max(200, { error: 'タイトルは200文字以内' }),
    slug: z.string().min(1, { error: 'スラッグは必須です' }).max(200).regex(/^[a-z0-9-]+$/, { error: 'スラッグは小文字英数字とハイフンのみ' }),
    excerpt: z.string().min(1, { error: '抜粋は必須です' }).max(500, { error: '抜粋は500文字以内' }),
    content: z.string().min(1, { error: '本文は必須です' }),
    thumbnailUrl: z.string().min(1, { error: 'サムネイルURLは必須です' }),
    categoryId: z.string().uuid({ error: 'カテゴリを選択してください' }),
    tags: z.array(z.string()).default([]),
    contentWidth: z.nativeEnum(LayoutWidth).nullable().optional(),
    contentWidthCustom: z.number().int().min(320).max(1920).nullable().optional(),
  })
  .merge(seoOgpFieldsSchema)

export type UpdatePostInput = z.infer<typeof updatePostSchema>

/**
 * 投稿記事フォームスキーマ（コンポーネント用）
 */
export const postFormSchema = z
  .object({
    title: z.string().min(1, { error: 'タイトルは必須です' }).max(200, { error: 'タイトルは200文字以内' }),
    slug: z.string().min(1, { error: 'スラッグは必須です' }).max(200).regex(/^[a-z0-9-]+$/, { error: 'スラッグは小文字英数字とハイフンのみ' }),
    excerpt: z.string().min(1, { error: '抜粋は必須です' }).max(500, { error: '抜粋は500文字以内' }),
    content: z.string().min(1, { error: '本文は必須です' }),
    thumbnailUrl: z.string().min(1, { error: 'サムネイルURLは必須です' }),
    categoryId: z.string().min(1, { error: 'カテゴリを選択してください' }),
    tags: z.string().optional(),
    status: z.nativeEnum(PostStatus),
    publishedAt: z.string().optional(),
    contentWidth: z.string().optional(),
    contentWidthCustom: z.string().optional(),
  })
  .merge(seoOgpFieldsFormSchema)

export type PostFormData = z.infer<typeof postFormSchema>

// =============================================================================
// Post Category Schemas
// =============================================================================

/**
 * 投稿カテゴリスキーマ（SEO/OGP含む）
 */
export const postCategorySchema = z.object({
  name: z.string().min(1, { error: 'カテゴリ名は必須です' }).max(50, { error: 'カテゴリ名は50文字以内' }),
  slug: z.string().min(1, { error: 'スラッグは必須です' }).max(50).regex(/^[a-z0-9-]+$/, { error: 'スラッグは小文字英数字とハイフンのみ' }),
  description: z.string().max(500).nullable().optional(),
  order: z.number().int().min(0).default(0),
  metaTitle: z.string().max(70).nullable().optional(),
  metaDescription: z.string().max(160).nullable().optional(),
  ogpImageUrl: z.string().url().nullable().optional().or(z.literal('')).or(z.literal(null)),
})

export type PostCategoryInput = z.infer<typeof postCategorySchema>

// =============================================================================
// Post Tag Schemas
// =============================================================================

/**
 * 投稿タグスキーマ（SEO/OGP含む）
 */
export const postTagSchema = z.object({
  name: z.string().min(1, { error: 'タグ名は必須です' }).max(50, { error: 'タグ名は50文字以内' }),
  slug: z.string().min(1, { error: 'スラッグは必須です' }).max(50).regex(/^[a-z0-9-]+$/, { error: 'スラッグは小文字英数字とハイフンのみ' }),
  description: z.string().max(500).nullable().optional(),
  metaTitle: z.string().max(70).nullable().optional(),
  metaDescription: z.string().max(160).nullable().optional(),
  ogpImageUrl: z.string().url().nullable().optional().or(z.literal('')).or(z.literal(null)),
})

export type PostTagInput = z.infer<typeof postTagSchema>

// =============================================================================
// Post Data Types
// =============================================================================

/**
 * 投稿記事データ型
 */
export type PostData = {
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
  status: PostStatus
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
 * 投稿記事バージョンデータ型
 */
export type PostVersionData = {
  id: string
  postId: string
  version: number
  content: string
  createdAt: Date
  createdBy: string | null
}

/**
 * 投稿カテゴリデータ型
 */
export type PostCategoryData = {
  id: string
  name: string
  slug: string
  description: string | null
  order: number
  metaTitle: string | null
  metaDescription: string | null
  ogpImageUrl: string | null
  createdAt: Date
  updatedAt: Date
  _count: {
    posts: number
  }
}

/**
 * 投稿タグデータ型
 */
export type PostTagData = {
  id: string
  name: string
  slug: string
  description: string | null
  metaTitle: string | null
  metaDescription: string | null
  ogpImageUrl: string | null
  createdAt: Date
  updatedAt: Date
  _count: {
    posts: number
  }
}

/**
 * 投稿記事一覧取得結果型
 */
export type GetPostsResult = {
  posts: PostData[]
  total: number
  page: number
  limit: number
  totalPages: number
}

/**
 * 投稿記事フィルター型
 */
export type PostFilters = {
  status?: 'ALL' | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED'
  categoryId?: string
  search?: string
}

/**
 * 投稿記事ページネーション型
 */
export type PostPagination = {
  page?: number
  limit?: number
  sortBy?: 'createdAt' | 'publishedAt' | 'viewCount'
  sortOrder?: 'asc' | 'desc'
}
