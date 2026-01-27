'use server'

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { NavigationType, SocialPlatform } from '@/shared/generated/prisma/enums'
import { z } from 'zod'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { getSession, getRoleFromSession } from '@/shared/lib/auth'
import { hasPermission, canAccessAdmin } from '@/admin/lib/permissions'
import { logPermissionDenied } from '@/admin/lib/audit'
import { purgeHomeCache } from '@/shared/lib/cloudflare'

// =============================================================================
// Types
// =============================================================================

export type NavigationItemData = {
  id: string
  type: NavigationType
  parentId: string | null
  label: string
  url: string
  isExternal: boolean
  order: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  children: NavigationItemData[]
}

export type SocialLinkData = {
  id: string
  platform: SocialPlatform
  url: string
  iconUrl: string | null
  order: number
  isActive: boolean
  showOnDesktop: boolean
  showOnMobile: boolean
  createdAt: Date
  updatedAt: Date
}

// =============================================================================
// Schemas
// =============================================================================

const navigationItemSchema = z.object({
  type: z.enum(['HEADER_DESKTOP', 'HEADER_MOBILE', 'FOOTER']),
  parentId: z.string().uuid().nullable().optional(),
  label: z.string().min(1, { error: 'ラベルは必須です' }).max(50, { error: 'ラベルは50文字以内' }),
  url: z.string().min(1, { error: 'URLは必須です' }).max(500),
  isExternal: z.boolean().default(false),
  order: z.number().int().min(0),
  isActive: z.boolean().default(true),
})

const socialLinkSchema = z.object({
  platform: z.enum(['TWITTER', 'FACEBOOK', 'INSTAGRAM', 'YOUTUBE', 'LINE', 'TIKTOK', 'OTHER']),
  url: z.string().min(1, { error: 'URLは必須です' }).url({ error: '有効なURLを入力してください' }),
  iconUrl: z.string().nullable().optional(),
  order: z.number().int().min(0),
  isActive: z.boolean().default(true),
  showOnDesktop: z.boolean().default(true),
  showOnMobile: z.boolean().default(true),
})

export type NavigationItemInput = z.infer<typeof navigationItemSchema>
export type SocialLinkInput = z.infer<typeof socialLinkSchema>

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * 読み取り権限チェック
 */
async function checkReadPermission(): Promise<boolean> {
  const session = await getSession()
  if (!session?.user) return false
  const role = getRoleFromSession(session)
  if (!role) return false
  if (!canAccessAdmin(role)) return false
  if (!hasPermission(role, 'navigation', 'read')) {
    void logPermissionDenied(session.user.id, 'navigation', 'read')
    return false
  }
  return true
}

// =============================================================================
// Navigation Item Actions
// =============================================================================

/**
 * ナビゲーションアイテム一覧を取得
 */
export async function getNavigationItems(type?: NavigationType): Promise<NavigationItemData[]> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return []
  }

  const items = await prisma.navigationItem.findMany({
    where: type ? { type, parentId: null } : { parentId: null },
    include: {
      children: {
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { order: 'asc' },
  })

  return items.map((item) => ({
    ...item,
    children: item.children.map((child) => ({
      ...child,
      children: [],
    })),
  }))
}

/**
 * ナビゲーションアイテムを作成
 */
export const createNavigationItem = withPermission<[data: NavigationItemInput], { id: string }>(
  'navigation',
  'create'
)(async (_user, data): Promise<ActionResult<{ id: string }>> => {
  const parsed = navigationItemSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const item = await prisma.navigationItem.create({
    data: parsed.data,
  })

  updateTag(CACHE_TAGS.NAVIGATION)

  // Cloudflare CDN キャッシュパージ（ナビゲーションは全ページに影響）
  void purgeHomeCache()

  return createSuccess('ナビゲーションを作成しました', { id: item.id })
})

/**
 * ナビゲーションアイテムを更新
 */
export const updateNavigationItem = withPermission<[id: string, data: NavigationItemInput], void>(
  'navigation',
  'update'
)(async (_user, id, data): Promise<ActionResult<void>> => {
  const parsed = navigationItemSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const existing = await prisma.navigationItem.findUnique({
    where: { id },
  })

  if (!existing) {
    return createFailure('ナビゲーションが見つかりません')
  }

  await prisma.navigationItem.update({
    where: { id },
    data: parsed.data,
  })

  updateTag(CACHE_TAGS.NAVIGATION)

  // Cloudflare CDN キャッシュパージ（ナビゲーションは全ページに影響）
  void purgeHomeCache()

  return createSuccess('ナビゲーションを更新しました')
})

/**
 * ナビゲーションアイテムを削除
 */
export const deleteNavigationItem = withPermission<[id: string], void>(
  'navigation',
  'delete'
)(async (_user, id): Promise<ActionResult<void>> => {
  const item = await prisma.navigationItem.findUnique({
    where: { id },
    include: {
      children: {
        select: { id: true },
      },
    },
  })

  if (!item) {
    return createFailure('ナビゲーションが見つかりません')
  }

  if (item.children.length > 0) {
    return createFailure('サブメニューがあるため削除できません')
  }

  await prisma.navigationItem.delete({
    where: { id },
  })

  updateTag(CACHE_TAGS.NAVIGATION)

  // Cloudflare CDN キャッシュパージ（ナビゲーションは全ページに影響）
  void purgeHomeCache()

  return createSuccess('ナビゲーションを削除しました')
})

/**
 * ナビゲーションの順序を更新
 */
export const updateNavigationOrder = withPermission<
  [items: { id: string; order: number; parentId?: string | null }[]],
  void
>(
  'navigation',
  'update'
)(async (_user, items): Promise<ActionResult<void>> => {
  await prisma.$transaction(
    items.map((item) =>
      prisma.navigationItem.update({
        where: { id: item.id },
        data: {
          order: item.order,
          ...(item.parentId !== undefined && { parentId: item.parentId }),
        },
      })
    )
  )

  updateTag(CACHE_TAGS.NAVIGATION)

  // Cloudflare CDN キャッシュパージ（ナビゲーションは全ページに影響）
  void purgeHomeCache()

  return createSuccess('順序を更新しました')
})

/**
 * SNSリンクの順序を更新
 */
export const updateSocialLinkOrder = withPermission<[items: { id: string; order: number }[]], void>(
  'navigation',
  'update'
)(async (_user, items): Promise<ActionResult<void>> => {
  await prisma.$transaction(
    items.map((item) =>
      prisma.socialLink.update({
        where: { id: item.id },
        data: { order: item.order },
      })
    )
  )

  updateTag(CACHE_TAGS.NAVIGATION)

  // Cloudflare CDN キャッシュパージ（ナビゲーションは全ページに影響）
  void purgeHomeCache()

  return createSuccess('順序を更新しました')
})

// =============================================================================
// Social Link Actions
// =============================================================================

/**
 * SNSリンク取得オプション
 */
export type GetSocialLinksOptions = {
  /** デスクトップで表示するリンクのみ取得 */
  showOnDesktop?: boolean
  /** モバイルで表示するリンクのみ取得 */
  showOnMobile?: boolean
  /** アクティブなリンクのみ取得（デフォルト: true） */
  activeOnly?: boolean
}

/**
 * SNSリンク一覧を取得
 */
export async function getSocialLinks(options: GetSocialLinksOptions = {}): Promise<SocialLinkData[]> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return []
  }

  const { showOnDesktop, showOnMobile, activeOnly = false } = options

  return prisma.socialLink.findMany({
    where: {
      ...(activeOnly && { isActive: true }),
      ...(showOnDesktop !== undefined && { showOnDesktop }),
      ...(showOnMobile !== undefined && { showOnMobile }),
    },
    orderBy: { order: 'asc' },
  })
}

/**
 * SNSリンクを作成
 */
export const createSocialLink = withPermission<[data: SocialLinkInput], { id: string }>(
  'navigation',
  'create'
)(async (_user, data): Promise<ActionResult<{ id: string }>> => {
  const parsed = socialLinkSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const link = await prisma.socialLink.create({
    data: parsed.data,
  })

  updateTag(CACHE_TAGS.NAVIGATION)

  // Cloudflare CDN キャッシュパージ（ナビゲーションは全ページに影響）
  void purgeHomeCache()

  return createSuccess('SNSリンクを作成しました', { id: link.id })
})

/**
 * SNSリンクを更新
 */
export const updateSocialLink = withPermission<[id: string, data: SocialLinkInput], void>(
  'navigation',
  'update'
)(async (_user, id, data): Promise<ActionResult<void>> => {
  const parsed = socialLinkSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const existing = await prisma.socialLink.findUnique({
    where: { id },
  })

  if (!existing) {
    return createFailure('SNSリンクが見つかりません')
  }

  await prisma.socialLink.update({
    where: { id },
    data: parsed.data,
  })

  updateTag(CACHE_TAGS.NAVIGATION)

  // Cloudflare CDN キャッシュパージ（ナビゲーションは全ページに影響）
  void purgeHomeCache()

  return createSuccess('SNSリンクを更新しました')
})

/**
 * SNSリンクを削除
 */
export const deleteSocialLink = withPermission<[id: string], void>(
  'navigation',
  'delete'
)(async (_user, id): Promise<ActionResult<void>> => {
  const link = await prisma.socialLink.findUnique({
    where: { id },
  })

  if (!link) {
    return createFailure('SNSリンクが見つかりません')
  }

  await prisma.socialLink.delete({
    where: { id },
  })

  updateTag(CACHE_TAGS.NAVIGATION)

  // Cloudflare CDN キャッシュパージ（ナビゲーションは全ページに影響）
  void purgeHomeCache()

  return createSuccess('SNSリンクを削除しました')
})
