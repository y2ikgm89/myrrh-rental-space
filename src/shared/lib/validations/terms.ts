import { z } from 'zod'
import { TermsType, TermsStatus } from '@/shared/generated/prisma/enums'

// ==============================================
// Constants
// ==============================================

/**
 * 規約タイプの選択肢
 */
export const TERMS_TYPES = [
  { value: 'TERMS_OF_USE', label: '利用規約' },
  { value: 'PRIVACY_POLICY', label: 'プライバシーポリシー' },
  { value: 'CANCELLATION', label: 'キャンセルポリシー' },
  { value: 'PAYMENT', label: '支払い規約' },
  { value: 'CUSTOM', label: 'カスタム規約' },
] as const

// ==============================================
// Terms Master Schemas
// ==============================================

/**
 * 規約作成スキーマ
 */
export const createTermsSchema = z.object({
  type: z.nativeEnum(TermsType),
  title: z
    .string()
    .min(1, 'タイトルを入力してください')
    .max(100, 'タイトルは100文字以内で入力してください'),
  slug: z
    .string()
    .min(1, 'スラッグを入力してください')
    .max(50, 'スラッグは50文字以内で入力してください')
    .regex(/^[a-z0-9-]+$/, 'スラッグは小文字英数字とハイフンのみ使用可能です'),
  isActive: z.boolean().default(true),
})

/**
 * 規約更新スキーマ
 */
export const updateTermsSchema = createTermsSchema.partial()

export type CreateTermsInput = z.input<typeof createTermsSchema>
export type UpdateTermsInput = z.input<typeof updateTermsSchema>

// ==============================================
// Terms Version Schemas
// ==============================================

/**
 * 規約バージョン作成スキーマ
 */
export const createTermsVersionSchema = z.object({
  termsId: z.string().uuid('規約IDが無効です'),
  content: z.string().min(1, 'コンテンツを入力してください'),
})

/**
 * 規約バージョン公開スキーマ
 */
export const publishTermsVersionSchema = z.object({
  versionId: z.string().uuid('バージョンIDが無効です'),
})

/**
 * 規約バージョン更新スキーマ
 */
export const updateTermsVersionSchema = z.object({
  content: z.string().min(1, 'コンテンツを入力してください'),
})

export type CreateTermsVersionInput = z.input<typeof createTermsVersionSchema>
export type PublishTermsVersionInput = z.input<typeof publishTermsVersionSchema>
export type UpdateTermsVersionInput = z.input<typeof updateTermsVersionSchema>

// ==============================================
// Terms Agreement Schemas
// ==============================================

/**
 * 規約同意記録スキーマ
 */
export const recordTermsAgreementSchema = z.object({
  termsId: z.string().uuid('規約IDが無効です'),
  versionId: z.string().uuid('バージョンIDが無効です'),
  reservationId: z.string().uuid('予約IDが無効です').optional(),
  userId: z.string().uuid('ユーザーIDが無効です').optional(),
  guestName: z.string().optional(),
  guestEmail: z.string().email('メールアドレスが無効です').optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
})

export type RecordTermsAgreementInput = z.input<typeof recordTermsAgreementSchema>

// ==============================================
// Public API Schemas（予約フォーム用）
// ==============================================

/**
 * スペースの規約取得スキーマ
 */
export const getTermsForSpaceSchema = z.object({
  spaceId: z.string().uuid('スペースIDが無効です'),
})

/**
 * 規約同意スキーマ（複数規約対応）
 */
export const agreeToTermsSchema = z.object({
  versionIds: z
    .array(z.string().uuid('バージョンIDが無効です'))
    .min(1, '規約に同意してください'),
})

export type GetTermsForSpaceInput = z.input<typeof getTermsForSpaceSchema>
export type AgreeToTermsInput = z.input<typeof agreeToTermsSchema>

// ==============================================
// Response Types
// ==============================================

/**
 * 規約とその現在バージョンの型
 */
export interface TermsWithVersion {
  id: string
  type: TermsType
  title: string
  slug: string
  isActive: boolean
  currentVersion: {
    id: string
    version: number
    content: string
    publishedAt: Date
  } | null
}


/**
 * 規約とその現在バージョンの型（Client Component向けシリアライズ版）
 * DateをISO文字列に、Prisma enumを文字列に変換したもの
 */
export interface SerializedTermsWithVersion {
  id: string
  type: string // Prisma enumをプレーン文字列に変換
  title: string
  slug: string
  isActive: boolean
  currentVersion: {
    id: string
    version: number
    content: string
    publishedAt: string // ISO 8601形式
  } | null
}

/**
 * TermsWithVersionをシリアライズ（Server → Client Component受け渡し用）
 * Prisma enumとDateをプレーン値に変換
 */
export function serializeTermsWithVersion(
  terms: TermsWithVersion | null
): SerializedTermsWithVersion | null {
  if (!terms) return null

  return {
    id: terms.id,
    type: String(terms.type), // Prisma enumをプレーン文字列に変換
    title: terms.title,
    slug: terms.slug,
    isActive: terms.isActive,
    currentVersion: terms.currentVersion
      ? {
          id: terms.currentVersion.id,
          version: terms.currentVersion.version,
          content: terms.currentVersion.content,
          publishedAt: terms.currentVersion.publishedAt.toISOString(),
        }
      : null,
  }
}

/**
 * 規約詳細（管理画面用）
 */
export interface TermsDetail {
  id: string
  type: TermsType
  title: string
  slug: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  versions: {
    id: string
    version: number
    status: TermsStatus
    publishedAt: Date | null
    isCurrentVersion: boolean
    createdAt: Date
  }[]
  _count: {
    spaces: number
    agreements: number
  }
}

/**
 * 規約バージョン詳細
 */
export interface TermsVersionDetail {
  id: string
  termsId: string
  version: number
  content: string
  status: TermsStatus
  publishedAt: Date | null
  publishedBy: string | null
  isCurrentVersion: boolean
  createdAt: Date
  createdBy: string
}

/**
 * 規約同意記録
 */
export interface TermsAgreementRecord {
  id: string
  termsId: string
  versionId: string
  reservationId: string | null
  userId: string | null
  guestName: string | null
  guestEmail: string | null
  agreedAt: Date
  terms: {
    title: string
    type: TermsType
  }
  version: {
    version: number
  }
}
