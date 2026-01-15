import { z } from 'zod'
import { LayoutWidth } from '@/generated/prisma/client/enums'

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
  contentWidth: z.nativeEnum(LayoutWidth).optional(),
  contentWidthCustom: z.number().int().min(320).max(1920).optional(),
})

/**
 * ページ作成用バリデーションスキーマ
 */
export const createPageSchema = z.object({
  slug: z
    .string()
    .min(1, 'スラッグは必須です')
    .max(100, 'スラッグは100文字以内です')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'スラッグは半角英数字とハイフンのみ使用可能です'),
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内です'),
  description: z.string().max(500, '説明は500文字以内です').optional(),
  isPublished: z.boolean().default(false),
})

export type UpdatePageInput = z.infer<typeof updatePageSchema>
export type CreatePageInput = z.infer<typeof createPageSchema>


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
  contentWidth: LayoutWidth | null
  contentWidthCustom: number | null
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
 * - privacy: プライバシーポリシー
 * - terms: 利用規約
 * - homepage: ホームページ（セクション管理）
 */
export const SYSTEM_PAGE_SLUGS = ['privacy', 'terms', 'homepage'] as const
export type SystemPageSlug = (typeof SYSTEM_PAGE_SLUGS)[number]
