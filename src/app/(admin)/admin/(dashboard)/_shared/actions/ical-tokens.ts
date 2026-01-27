'use server'

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { createSuccess, createFailure } from '@/admin/types/server-actions'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { verifyAdminSession } from '@/shared/lib/auth'

// =============================================================================
// Types
// =============================================================================

export type ICalTokenWithRelations = {
  id: string
  token: string
  name: string
  spaceId: string | null
  spaceName: string | null
  createdBy: string
  createdByName: string | null
  expiresAt: Date | null
  createdAt: Date
  lastUsedAt: Date | null
}

// =============================================================================
// Schemas
// =============================================================================

const createTokenSchema = z.object({
  name: z.string().min(1, { error: 'トークン名は必須です' }).max(100),
  spaceId: z.string().uuid().nullable(),
  expiresInDays: z.number().int().min(0).nullable(), // 0 or null = 無期限
})

// =============================================================================
// Actions
// =============================================================================

/**
 * iCalトークン一覧を取得
 */
export async function getICalTokens(): Promise<ICalTokenWithRelations[]> {
  await verifyAdminSession()

  const tokens = await prisma.iCalToken.findMany({
    include: {
      space: { select: { name: true } },
      user: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return tokens.map((t) => ({
    id: t.id,
    token: t.token,
    name: t.name,
    spaceId: t.spaceId,
    spaceName: t.space?.name ?? null,
    createdBy: t.createdBy,
    createdByName: t.user.name,
    expiresAt: t.expiresAt,
    createdAt: t.createdAt,
    lastUsedAt: t.lastUsedAt,
  }))
}

/**
 * iCalトークンを作成
 */
export const createICalToken = withPermission<
  [{ name: string; spaceId: string | null; expiresInDays: number | null }],
  { id: string; token: string }
>(
  'settings',
  'update'
)(async (user, data) => {
  const parsed = createTokenSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure('入力が不正です', parsed.error.flatten().fieldErrors)
  }

  const { name, spaceId, expiresInDays } = parsed.data

  // スペースIDの検証
  if (spaceId) {
    const space = await prisma.space.findUnique({ where: { id: spaceId } })
    if (!space) {
      return createFailure('スペースが見つかりません')
    }
  }

  // セキュアなトークン生成（32バイト = 256ビット）
  const token = randomBytes(32).toString('base64url')

  // 有効期限計算
  let expiresAt: Date | null = null
  if (expiresInDays && expiresInDays > 0) {
    expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiresInDays)
  }

  const newToken = await prisma.iCalToken.create({
    data: {
      token,
      name,
      spaceId,
      createdBy: user.id,
      expiresAt,
    },
  })

  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('トークンを作成しました', {
    id: newToken.id,
    token: newToken.token,
  })
})

/**
 * iCalトークンを削除
 */
export const deleteICalToken = withPermission<[string]>(
  'settings',
  'update'
)(async (_user, id) => {
  const token = await prisma.iCalToken.findUnique({ where: { id } })

  if (!token) {
    return createFailure('トークンが見つかりません')
  }

  await prisma.iCalToken.delete({ where: { id } })

  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('トークンを削除しました')
})

/**
 * iCalフィード設定を更新
 */
export const updateICalFeedSettings = withPermission<
  [{ icalFeedEnabled: boolean; icalFeedIncludeCustomerInfo: boolean }]
>(
  'settings',
  'update'
)(async (_user, data) => {
  await prisma.settings.updateMany({
    data: {
      icalFeedEnabled: data.icalFeedEnabled,
      icalFeedIncludeCustomerInfo: data.icalFeedIncludeCustomerInfo,
    },
  })

  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('設定を保存しました')
})

/**
 * iCalフィード設定を取得
 */
export async function getICalFeedSettings(): Promise<{
  icalFeedEnabled: boolean
  icalFeedIncludeCustomerInfo: boolean
}> {
  await verifyAdminSession()

  const settings = await prisma.settings.findFirst()

  return {
    icalFeedEnabled: settings?.icalFeedEnabled ?? false,
    icalFeedIncludeCustomerInfo: settings?.icalFeedIncludeCustomerInfo ?? false,
  }
}
