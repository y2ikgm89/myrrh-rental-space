'use server'

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { z } from 'zod'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { getSession, getRoleFromSession } from '@/shared/lib/auth'
import { hasPermission, canAccessAdmin } from '@/admin/lib/permissions'
import { logPermissionDenied } from '@/admin/lib/audit'
import { purgeHomeCache } from '@/shared/lib/cloudflare'
import { fireAndForget } from '@/shared/lib/async-utils'
import { ErrorCategory, ErrorSeverity } from '@/shared/lib/errors'
import { AnnouncementBarType } from '@/shared/generated/prisma/enums'
import { toPlainObject, toPlainArray } from '@/shared/lib/serialize'

// =============================================================================
// Types
// =============================================================================

export type AnnouncementBarData = {
  id: string
  message: string
  type: string
  linkUrl: string | null
  linkText: string | null
  bgColor: string | null
  textColor: string | null
  isActive: boolean
  priority: number
  startAt: Date | null
  endAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type GetAnnouncementBarsResult = {
  items: AnnouncementBarData[]
  total: number
}

// =============================================================================
// Schemas
// =============================================================================

const announcementBarSchema = z.object({
  message: z.string().min(1, { error: 'メッセージは必須です' }).max(200, { error: 'メッセージは200文字以内で入力してください' }),
  type: z.enum(AnnouncementBarType).default(AnnouncementBarType.info),
  linkUrl: z.string().url({ error: '有効なURLを入力してください' }).or(z.literal('')).nullable().optional(),
  linkText: z.string().max(50, { error: 'リンクテキストは50文字以内' }).nullable().optional(),
  bgColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, { error: '有効な色コードを入力してください' }).transform(v => v.toLowerCase()).or(z.literal('')).nullable().optional(),
  textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, { error: '有効な色コードを入力してください' }).transform(v => v.toLowerCase()).or(z.literal('')).nullable().optional(),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).max(100).default(0),
  startAt: z.string().nullable().optional(),
  endAt: z.string().nullable().optional(),
})

export type AnnouncementBarInput = z.infer<typeof announcementBarSchema>

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * 読み取り権限チェック（権限なしの場合は空結果を返すための軽量チェック）
 */
async function checkReadPermission(): Promise<boolean> {
  const session = await getSession()
  if (!session?.user) return false

  const role = getRoleFromSession(session)
  if (!role) return false
  if (!canAccessAdmin(role)) return false
  if (!hasPermission(role, 'announcementBar', 'read')) {
    void logPermissionDenied(session.user.id, 'announcementBar', 'read')
    return false
  }
  return true
}

// =============================================================================
// Read Actions
// =============================================================================

/**
 * お知らせバー一覧を取得（管理画面用）
 */
export async function getAnnouncementBars(): Promise<GetAnnouncementBarsResult> {
  if (!(await checkReadPermission())) {
    return { items: [], total: 0 }
  }

  const items = await prisma.announcementBar.findMany({
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'desc' },
    ],
  })

  return {
    items: toPlainArray(items),
    total: items.length,
  }
}

/**
 * 有効なお知らせバーを複数取得（フロントエンド用）
 * 優先度順、isActiveがtrueのもののみ
 *
 * Note: 表示期間（startAt/endAt）のフィルタリングはクライアントサイドで実行
 * cacheComponentsモードでは new Date() が静的レンダリング時に使用できないため
 *
 * 権限チェック不要（公開API）
 */
export async function getActiveAnnouncementBars(): Promise<AnnouncementBarData[]> {
  const bars = await prisma.announcementBar.findMany({
    where: {
      isActive: true,
    },
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'desc' },
    ],
  })

  return toPlainArray(bars)
}

/**
 * お知らせバー詳細を取得
 */
export async function getAnnouncementBarById(id: string): Promise<AnnouncementBarData | null> {
  if (!(await checkReadPermission())) {
    return null
  }

  return toPlainObject(await prisma.announcementBar.findUnique({
    where: { id },
  }))
}

// =============================================================================
// Write Actions (withPermission - 監査ログ自動記録)
// =============================================================================

/**
 * お知らせバーを作成
 */
export const createAnnouncementBar = withPermission<
  [data: AnnouncementBarInput],
  { id: string }
>('announcementBar', 'create')(async (user, data): Promise<ActionResult<{ id: string }>> => {
  const parsed = announcementBarSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const {
    message,
    type,
    linkUrl,
    linkText,
    bgColor,
    textColor,
    isActive,
    priority,
    startAt,
    endAt,
  } = parsed.data

  const bar = await prisma.announcementBar.create({
    data: {
      message,
      type,
      linkUrl: linkUrl || null,
      linkText: linkText || null,
      bgColor: bgColor || null,
      textColor: textColor || null,
      isActive,
      priority,
      startAt: startAt ? new Date(startAt) : null,
      endAt: endAt ? new Date(endAt) : null,
    },
  })

  updateTag(CACHE_TAGS.ANNOUNCEMENT_BAR)

  // Cloudflare CDN キャッシュパージ（アナウンスメントバーは全ページに影響）
  fireAndForget(purgeHomeCache(), { operation: 'purgeHomeCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

  return createSuccess('お知らせバーを作成しました', { id: bar.id })
})

/**
 * お知らせバーを更新
 */
export const updateAnnouncementBar = withPermission<
  [id: string, data: AnnouncementBarInput],
  void
>('announcementBar', 'update')(async (user, id, data): Promise<ActionResult<void>> => {
  const parsed = announcementBarSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const existing = await prisma.announcementBar.findUnique({
    where: { id },
    select: { id: true },
  })

  if (!existing) {
    return createFailure('お知らせバーが見つかりません')
  }

  const {
    message,
    type,
    linkUrl,
    linkText,
    bgColor,
    textColor,
    isActive,
    priority,
    startAt,
    endAt,
  } = parsed.data

  await prisma.announcementBar.update({
    where: { id },
    data: {
      message,
      type,
      linkUrl: linkUrl || null,
      linkText: linkText || null,
      bgColor: bgColor || null,
      textColor: textColor || null,
      isActive,
      priority,
      startAt: startAt ? new Date(startAt) : null,
      endAt: endAt ? new Date(endAt) : null,
    },
  })

  updateTag(CACHE_TAGS.ANNOUNCEMENT_BAR)

  // Cloudflare CDN キャッシュパージ（アナウンスメントバーは全ページに影響）
  fireAndForget(purgeHomeCache(), { operation: 'purgeHomeCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

  return createSuccess('お知らせバーを更新しました')
})

/**
 * お知らせバーを削除
 */
export const deleteAnnouncementBar = withPermission<[id: string], void>(
  'announcementBar',
  'delete'
)(async (user, id): Promise<ActionResult<void>> => {
  const bar = await prisma.announcementBar.findUnique({
    where: { id },
    select: { id: true },
  })

  if (!bar) {
    return createFailure('お知らせバーが見つかりません')
  }

  await prisma.announcementBar.delete({
    where: { id },
  })

  updateTag(CACHE_TAGS.ANNOUNCEMENT_BAR)

  // Cloudflare CDN キャッシュパージ（アナウンスメントバーは全ページに影響）
  fireAndForget(purgeHomeCache(), { operation: 'purgeHomeCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

  return createSuccess('お知らせバーを削除しました')
})

/**
 * 有効/無効を切り替え
 */
export const toggleAnnouncementBarActive = withPermission<[id: string], void>(
  'announcementBar',
  'update'
)(async (user, id): Promise<ActionResult<void>> => {
  const bar = await prisma.announcementBar.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  })

  if (!bar) {
    return createFailure('お知らせバーが見つかりません')
  }

  await prisma.announcementBar.update({
    where: { id },
    data: {
      isActive: !bar.isActive,
    },
  })

  updateTag(CACHE_TAGS.ANNOUNCEMENT_BAR)

  // Cloudflare CDN キャッシュパージ（アナウンスメントバーは全ページに影響）
  fireAndForget(purgeHomeCache(), { operation: 'purgeHomeCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

  return createSuccess('状態を変更しました')
})
