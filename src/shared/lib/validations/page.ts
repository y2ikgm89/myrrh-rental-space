/**
 * ページバリデーション（共有部分）
 *
 * システムページ定義とスラッグ関連のユーティリティ
 * admin/public両方で使用
 */

import { z } from 'zod'
import { LayoutWidth } from '@/shared/generated/prisma/enums'

// =============================================================================
// システムページ定義
// =============================================================================

/**
 * システムページ定義
 *
 * システムページは削除不可。セクションシステムで編集可能。
 * すべてのページは /[slug] で統一されたURLで表示される。
 *
 * Note: 以下は各専用管理ページで管理
 * - posts/news → /admin/posts, /admin/news
 * - terms → /admin/terms（Termsテーブルで管理）
 */
export interface SystemPageDefinition {
  slug: string
  title: string
  description: string
}

export const SYSTEM_PAGES: readonly SystemPageDefinition[] = [
  { slug: 'home', title: 'ホームページ', description: 'トップページ' },
  { slug: 'privacy', title: 'プライバシーポリシー', description: '個人情報の取り扱いについて' },
  { slug: 'about', title: '会社概要', description: '会社・サービスについて' },
  { slug: 'faq', title: 'よくある質問', description: 'FAQ' },
  { slug: 'reservation', title: '予約', description: 'レンタルスペースの予約' },
  { slug: 'spaces', title: 'スペース一覧', description: 'ご利用可能なレンタルスペース' },
  { slug: 'contact', title: 'お問い合わせ', description: 'お問い合わせフォーム' },
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

// =============================================================================
// ページデータ型
// =============================================================================

/**
 * ページデータ型
 *
 * Prisma生成型を直接使用（公式ベストプラクティス）
 * - 型アサーション不要
 * - スキーマ変更時に自動同期
 * @see https://www.prisma.io/docs/concepts/components/prisma-client/type-safety
 */
export type { PageModel as PageData } from '@/shared/generated/prisma/models/Page'

// =============================================================================
// バリデーションスキーマ（admin用、ここからre-export）
// =============================================================================

/**
 * SEO/OGP更新用バリデーションスキーマ（システムページ用）
 */
export const updatePageSeoSchema = z.object({
  title: z.string().min(1, { error: 'タイトルは必須です' }).max(200, { error: 'タイトルは200文字以内です' }),
  metaDescription: z.string().max(160, { error: 'メタディスクリプションは160文字以内です' }).optional(),
  metaKeywords: z.string().max(200, { error: 'メタキーワードは200文字以内です' }).optional(),
  ogpTitle: z.string().max(100, { error: 'OGPタイトルは100文字以内です' }).optional(),
  ogpDescription: z.string().max(200, { error: 'OGP説明は200文字以内です' }).optional(),
  ogpImageUrl: z.string().url({ error: '有効なURLを入力してください' }).optional().or(z.literal('')),
})

export type UpdatePageSeoInput = z.infer<typeof updatePageSeoSchema>

/**
 * ページ更新用バリデーションスキーマ（コンテンツ編集可能ページ用）
 */
export const updatePageSchema = z.object({
  title: z.string().min(1, { error: 'タイトルは必須です' }).max(200, { error: 'タイトルは200文字以内です' }),
  description: z.string().max(500, { error: '説明は500文字以内です' }).optional(),
  metaDescription: z.string().max(160, { error: 'メタディスクリプションは160文字以内です' }).optional(),
  metaKeywords: z.string().max(200, { error: 'メタキーワードは200文字以内です' }).optional(),
  ogpTitle: z.string().max(100, { error: 'OGPタイトルは100文字以内です' }).optional(),
  ogpDescription: z.string().max(200, { error: 'OGP説明は200文字以内です' }).optional(),
  ogpImageUrl: z.string().url({ error: '有効なURLを入力してください' }).optional().or(z.literal('')),
  isPublished: z.boolean().default(true),
  publishedAt: z.coerce.date().optional(),
  contentWidth: z.enum(LayoutWidth).optional(),
  contentWidthCustom: z.number().int().min(320).max(1920).optional(),
  showSidebar: z.boolean().nullable().optional(),
})

/**
 * ページ作成用バリデーションスキーマ
 */
export const createPageSchema = z.object({
  slug: z
    .string()
    .min(1, { error: 'スラッグは必須です' })
    .max(100, { error: 'スラッグは100文字以内です' })
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: 'スラッグは半角英数字とハイフンのみ使用可能です' }),
  title: z.string().min(1, { error: 'タイトルは必須です' }).max(200, { error: 'タイトルは200文字以内です' }),
  description: z.string().max(500, { error: '説明は500文字以内です' }).optional(),
  isPublished: z.boolean().default(false),
})

export type UpdatePageInput = z.infer<typeof updatePageSchema>
export type CreatePageInput = z.infer<typeof createPageSchema>
