import { z } from 'zod'
import { LayoutWidth } from '@/generated/prisma/client/enums'

/**
 * SEO/OGP更新用バリデーションスキーマ（システムページ用）
 */
export const updatePageSeoSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内です'),
  metaDescription: z.string().max(160, 'メタディスクリプションは160文字以内です').optional(),
  metaKeywords: z.string().max(200, 'メタキーワードは200文字以内です').optional(),
  ogpTitle: z.string().max(100, 'OGPタイトルは100文字以内です').optional(),
  ogpDescription: z.string().max(200, 'OGP説明は200文字以内です').optional(),
  ogpImageUrl: z.string().url('有効なURLを入力してください').optional().or(z.literal('')),
})

export type UpdatePageSeoInput = z.infer<typeof updatePageSeoSchema>

/**
 * ページ更新用バリデーションスキーマ（コンテンツ編集可能ページ用）
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
  isSystemPage: boolean
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
 * システムページ定義
 * - コンテンツ編集可能: privacy, terms, about, faq（Lexicalエディタで編集）
 * - SEOのみ編集可能: reservation, spaces, contact, blog, news（コードで実装）
 */
export interface SystemPageDefinition {
  slug: string
  title: string
  description: string
  isContentEditable: boolean
}

export const SYSTEM_PAGES: readonly SystemPageDefinition[] = [
  // コンテンツ編集可能なシステムページ
  { slug: 'privacy', title: 'プライバシーポリシー', description: '個人情報の取り扱いについて', isContentEditable: true },
  { slug: 'terms', title: '利用規約', description: 'サービス利用規約', isContentEditable: true },
  { slug: 'about', title: '会社概要', description: '会社・サービスについて', isContentEditable: true },
  { slug: 'faq', title: 'よくある質問', description: 'FAQ', isContentEditable: true },
  // SEOのみ編集可能なシステムページ（コンテンツはコードで実装）
  { slug: 'reservation', title: '予約', description: 'レンタルスペースの予約', isContentEditable: false },
  { slug: 'spaces', title: 'スペース一覧', description: 'ご利用可能なレンタルスペース', isContentEditable: false },
  { slug: 'contact', title: 'お問い合わせ', description: 'お問い合わせフォーム', isContentEditable: false },
  { slug: 'blog', title: 'ブログ', description: 'ブログ記事一覧', isContentEditable: false },
  { slug: 'news', title: 'お知らせ', description: 'ニュース・お知らせ一覧', isContentEditable: false },
]

export const SYSTEM_PAGE_SLUGS = SYSTEM_PAGES.map((p) => p.slug)

/**
 * スラッグからシステムページ定義を取得
 */
export function getSystemPageDefinition(slug: string): SystemPageDefinition | undefined {
  return SYSTEM_PAGES.find((p) => p.slug === slug)
}

/**
 * システムページかどうかを判定
 */
export function isSystemPageSlug(slug: string): boolean {
  return SYSTEM_PAGE_SLUGS.includes(slug)
}

/**
 * ページが削除可能かどうかを判定
 * システムページは削除不可
 */
export function canDeletePage(slug: string): boolean {
  return !isSystemPageSlug(slug)
}
