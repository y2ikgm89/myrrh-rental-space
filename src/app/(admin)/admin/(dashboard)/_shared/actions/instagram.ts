'use server'

/**
 * Instagram Server Actions
 *
 * Instagram連携の設定・管理用Server Actions
 */

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { createSuccess, createFailure } from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { encrypt, safeDecrypt } from '@/shared/lib/crypto'
import { checkReadPermissionFor } from '@/admin/lib/permissions'
import {
  instagramSettingsSchema,
  instagramTokenSchema,
  instagramPostUrlSchema,
  extractInstagramShortcode,
  type InstagramSettingsInput,
} from '@/shared/lib/validations/instagram'
import {
  testInstagramConnection,
  getTokenExpiryDays,
  shouldRefreshToken,
} from '@/shared/lib/instagram'
import { InstagramFeedLayout, InstagramMediaType } from '@/shared/generated/prisma/enums'
import { getValidInstagramFeedLayout } from '@/shared/lib/validations/enums'

// =============================================================================
// Types
// =============================================================================

export type InstagramConfig = {
  isConnected: boolean
  username: string | null
  accountType: string | null
  tokenExpiresAt: Date | null
  tokenExpiryDays: number | null
  shouldRefreshToken: boolean
  feedEnabled: boolean
  feedLayout: InstagramFeedLayout
  feedColumns: number
  feedMaxItems: number
  showCaption: boolean
  showViewAll: boolean
}

export type InstagramPostData = {
  id: string
  postId: string
  postUrl: string
  mediaUrl: string | null
  caption: string | null
  sortOrder: number
  createdAt: Date
}

// =============================================================================
// Helpers
// =============================================================================

const checkReadPermission = checkReadPermissionFor('settings')

function getMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key]
  return typeof value === 'string' ? value : undefined
}

// =============================================================================
// GET Actions
// =============================================================================

/**
 * Instagram設定を取得
 */
export async function getInstagramConfig(): Promise<InstagramConfig> {
  if (!(await checkReadPermission())) {
    return {
      isConnected: false,
      username: null,
      accountType: null,
      tokenExpiresAt: null,
      tokenExpiryDays: null,
      shouldRefreshToken: false,
      feedEnabled: false,
      feedLayout: InstagramFeedLayout.grid,
      feedColumns: 4,
      feedMaxItems: 8,
      showCaption: false,
      showViewAll: true,
    }
  }

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      instagramAccessToken: true,
      instagramTokenExpiresAt: true,
      instagramUserId: true,
      instagramUsername: true,
      instagramAccountType: true,
      instagramFeedEnabled: true,
      instagramFeedLayout: true,
      instagramFeedColumns: true,
      instagramFeedMaxItems: true,
      instagramShowCaption: true,
      instagramShowViewAll: true,
    },
  })

  const isConnected = Boolean(
    settings?.instagramAccessToken && settings?.instagramUserId
  )

  const tokenExpiresAt = settings?.instagramTokenExpiresAt || null
  const tokenExpiryDays = tokenExpiresAt
    ? getTokenExpiryDays(tokenExpiresAt)
    : null
  const needsRefresh = tokenExpiresAt
    ? shouldRefreshToken(tokenExpiresAt)
    : false

  return {
    isConnected,
    username: settings?.instagramUsername || null,
    accountType: settings?.instagramAccountType || null,
    tokenExpiresAt,
    tokenExpiryDays,
    shouldRefreshToken: needsRefresh,
    feedEnabled: settings?.instagramFeedEnabled ?? false,
    feedLayout: getValidInstagramFeedLayout(settings?.instagramFeedLayout),
    feedColumns: settings?.instagramFeedColumns ?? 4,
    feedMaxItems: settings?.instagramFeedMaxItems ?? 8,
    showCaption: settings?.instagramShowCaption ?? false,
    showViewAll: settings?.instagramShowViewAll ?? true,
  }
}

/**
 * 手動選択されたInstagram投稿を取得
 */
export async function getInstagramPosts(): Promise<InstagramPostData[]> {
  if (!(await checkReadPermission())) return []

  const posts = await prisma.instagramPost.findMany({
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      postId: true,
      postUrl: true,
      mediaUrl: true,
      caption: true,
      sortOrder: true,
      createdAt: true,
    },
  })

  return posts
}

// =============================================================================
// UPDATE Actions - Settings
// =============================================================================

/**
 * Instagram表示設定を更新
 */
export const updateInstagramSettings = withPermission<[InstagramSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data) => {
    const parsed = instagramSettingsSchema.safeParse(data)
    if (!parsed.success) {
      return createValidationError(parsed.error)
    }

    await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        instagramFeedEnabled: parsed.data.feedEnabled,
        instagramFeedLayout: parsed.data.feedLayout,
        instagramFeedColumns: parsed.data.feedColumns,
        instagramFeedMaxItems: parsed.data.feedMaxItems,
        instagramShowCaption: parsed.data.showCaption,
        instagramShowViewAll: parsed.data.showViewAll,
      },
      update: {
        instagramFeedEnabled: parsed.data.feedEnabled,
        instagramFeedLayout: parsed.data.feedLayout,
        instagramFeedColumns: parsed.data.feedColumns,
        instagramFeedMaxItems: parsed.data.feedMaxItems,
        instagramShowCaption: parsed.data.showCaption,
        instagramShowViewAll: parsed.data.showViewAll,
      },
    })

    updateTag(CACHE_TAGS.SETTINGS)
    return createSuccess('Instagram設定を更新しました')
  }
)

// =============================================================================
// Token Management Actions
// =============================================================================

/**
 * 手動でアクセストークンを保存
 */
export const saveManualToken = withPermission<[string], { username: string | undefined }>(
  'settings',
  'update'
)(async (_user, token) => {
    const parsed = instagramTokenSchema.safeParse(token)
    if (!parsed.success) {
      return createValidationError(parsed.error)
    }

    // トークンをテストしてユーザー情報を取得
    const testResult = await testInstagramConnection(parsed.data)
    if (!testResult.success) {
      return createFailure(testResult.error || '接続テストに失敗しました')
    }

    const metadata = testResult.metadata
    const userId = getMetadataString(metadata, 'userId')
    const username = getMetadataString(metadata, 'username')
    const accountType = getMetadataString(metadata, 'accountType')

    // トークンを暗号化
    let encryptedToken: string
    try {
      encryptedToken = encrypt(parsed.data, { purpose: 'instagram' })
    } catch {
      return createFailure('トークンの暗号化に失敗しました')
    }

    // 60日後の有効期限（長期トークンのデフォルト）
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 60)

    await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        instagramAccessToken: encryptedToken,
        instagramTokenExpiresAt: expiresAt,
        instagramUserId: userId || null,
        instagramUsername: username || null,
        instagramAccountType: accountType || null,
      },
      update: {
        instagramAccessToken: encryptedToken,
        instagramTokenExpiresAt: expiresAt,
        instagramUserId: userId || null,
        instagramUsername: username || null,
        instagramAccountType: accountType || null,
      },
    })

    updateTag(CACHE_TAGS.SETTINGS)
    return createSuccess('Instagramトークンを保存しました', {
      username,
    })
  }
)

/**
 * Instagram接続をテスト
 */
export const testInstagramConnectionAction = withPermission<
  [string],
  { username: string | undefined; message: string }
>('settings', 'update')(async (_user, token) => {
    const parsed = instagramTokenSchema.safeParse(token)
    if (!parsed.success) {
      return createValidationError(parsed.error)
    }

    const result = await testInstagramConnection(parsed.data)

    if (result.success) {
      const username = getMetadataString(result.metadata, 'username')
      return createSuccess(result.message || '接続テストに成功しました', {
        username,
        message: result.message || '',
      })
    }

    return createFailure(result.error || '接続テストに失敗しました')
  }
)

/**
 * Instagram連携を解除
 */
export const disconnectInstagram = withPermission<[], void>(
  'settings',
  'update'
)(async () => {
    await prisma.settings.update({
      where: { id: 'singleton' },
      data: {
        instagramAccessToken: null,
        instagramTokenExpiresAt: null,
        instagramUserId: null,
        instagramUsername: null,
        instagramAccountType: null,
      },
    })

    // キャッシュされた投稿も削除
    await prisma.instagramPost.deleteMany({})

    updateTag(CACHE_TAGS.SETTINGS)
    return createSuccess('Instagram連携を解除しました')
  }
)

// =============================================================================
// Manual Post Management Actions
// =============================================================================

/**
 * Instagram投稿を手動追加
 */
export const addInstagramPost = withPermission<[string], void>(
  'settings',
  'update'
)(async (_user, url) => {
    const parsed = instagramPostUrlSchema.safeParse(url)
    if (!parsed.success) {
      return createValidationError(parsed.error)
    }

    const shortcode = extractInstagramShortcode(parsed.data)
    if (!shortcode) {
      return createFailure('Instagram投稿URLからIDを抽出できませんでした')
    }

    // 既存チェック
    const existing = await prisma.instagramPost.findUnique({
      where: { postId: shortcode },
    })
    if (existing) {
      return createFailure('この投稿は既に追加されています')
    }

    // 現在の最大sortOrderを取得
    const maxOrderResult = await prisma.instagramPost.aggregate({
      _max: { sortOrder: true },
    })
    const nextOrder = (maxOrderResult._max?.sortOrder ?? -1) + 1

    await prisma.instagramPost.create({
      data: {
        postId: shortcode,
        postUrl: parsed.data,
        mediaType: InstagramMediaType.IMAGE, // デフォルト値、oEmbed取得時に更新
        permalink: parsed.data,
        sortOrder: nextOrder,
      },
    })

    updateTag(CACHE_TAGS.SETTINGS)
    return createSuccess('Instagram投稿を追加しました')
  }
)

/**
 * Instagram投稿を削除
 */
export const removeInstagramPost = withPermission<[string], void>(
  'settings',
  'update'
)(async (_user, id) => {
    const post = await prisma.instagramPost.findUnique({
      where: { id },
    })

    if (!post) {
      return createFailure('指定された投稿が見つかりません')
    }

    await prisma.instagramPost.delete({
      where: { id },
    })

    updateTag(CACHE_TAGS.SETTINGS)
    return createSuccess('Instagram投稿を削除しました')
  }
)

/**
 * Instagram投稿の並び順を更新
 */
export const reorderInstagramPosts = withPermission<[string[]], void>(
  'settings',
  'update'
)(async (_user, ids) => {
    if (!Array.isArray(ids) || ids.length === 0) {
      return createFailure('並び順のIDリストが必要です')
    }

    // トランザクションで一括更新
    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.instagramPost.update({
          where: { id },
          data: { sortOrder: index },
        })
      )
    )

    updateTag(CACHE_TAGS.SETTINGS)
    return createSuccess('並び順を更新しました')
  }
)

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * 保存されたアクセストークンを復号化して取得（内部使用）
 */
export async function getDecryptedInstagramToken(): Promise<string | null> {
  if (!(await checkReadPermission())) return null

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: { instagramAccessToken: true },
  })

  if (!settings?.instagramAccessToken) {
    return null
  }

  return safeDecrypt(settings.instagramAccessToken)
}
