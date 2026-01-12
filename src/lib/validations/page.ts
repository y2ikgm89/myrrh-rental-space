import { z } from 'zod'

/**
 * ページ更新用バリデーションスキーマ
 */
export const updatePageSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内です'),
  description: z.string().max(500, '説明は500文字以内です').optional(),
  content: z.string().min(1, 'コンテンツは必須です').max(500000, 'コンテンツは500,000文字以内です'),
  metaDescription: z.string().max(160, 'メタディスクリプションは160文字以内です').optional(),
  metaKeywords: z.string().max(200, 'メタキーワードは200文字以内です').optional(),
  ogpTitle: z.string().max(100, 'OGPタイトルは100文字以内です').optional(),
  ogpDescription: z.string().max(200, 'OGP説明は200文字以内です').optional(),
  ogpImageUrl: z.string().url('有効なURLを入力してください').optional().or(z.literal('')),
  isPublished: z.boolean().default(true),
  publishedAt: z.coerce.date().optional(),
  contentWidth: z.enum(['XS', 'SM', 'MD', 'LG', 'CUSTOM']).optional(),
  contentWidthCustom: z.number().int().min(320).max(1920).optional(),
})

export type UpdatePageInput = z.infer<typeof updatePageSchema>

/**
 * ホームページヒーロー更新用バリデーションスキーマ
 */
/**
 * URL検証: 内部パス（/で始まる）またはhttp/httpsのみ許可
 */
const safeUrlSchema = z
  .string()
  .max(200, 'URLは200文字以内です')
  .refine(
    (url) => url === '' || url.startsWith('/') || url.startsWith('http://') || url.startsWith('https://'),
    '有効なURLまたはパス（/で始まる）を入力してください'
  )

export const updateHomepageHeroSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(100, 'タイトルは100文字以内です'),
  subtitle: z.string().max(300, 'サブタイトルは300文字以内です').optional(),
  ctaPrimaryText: z.string().min(1, 'ボタンテキストは必須です').max(50, 'ボタンテキストは50文字以内です'),
  ctaPrimaryUrl: safeUrlSchema.refine((url) => url.length > 0, 'ボタンURLは必須です'),
  ctaSecondaryText: z.string().max(50, 'ボタンテキストは50文字以内です').optional(),
  ctaSecondaryUrl: safeUrlSchema.optional().or(z.literal('')),
  backgroundImageUrl: z.string().url('有効なURLを入力してください').optional().or(z.literal('')),
  isActive: z.boolean().default(true),
})

export type UpdateHomepageHeroInput = z.infer<typeof updateHomepageHeroSchema>

/**
 * ページデータ型
 */
export type PageData = {
  id: string
  slug: string
  title: string
  description: string | null
  content: string
  metaDescription: string | null
  metaKeywords: string | null
  ogpTitle: string | null
  ogpDescription: string | null
  ogpImageUrl: string | null
  isPublished: boolean
  publishedAt: Date | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  contentWidth: string | null
  contentWidthCustom: number | null
}

/**
 * ホームページヒーローデータ型
 */
export type HomepageHeroData = {
  id: string
  title: string
  subtitle: string | null
  ctaPrimaryText: string
  ctaPrimaryUrl: string
  ctaSecondaryText: string | null
  ctaSecondaryUrl: string | null
  backgroundImageUrl: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * Server Actionレスポンス型
 */
export type PageActionResult =
  | { success: true; message: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

/**
 * システムページのスラッグリスト
 */
export const SYSTEM_PAGE_SLUGS = ['privacy', 'terms'] as const
export type SystemPageSlug = (typeof SYSTEM_PAGE_SLUGS)[number]
