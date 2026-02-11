'use server'

/**
 * 基本情報・レイアウト・SEO設定 Server Actions
 *
 * @module admin/actions/settings/basic
 */

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { safeDecrypt } from '@/shared/lib/crypto'
import {
  parseBusinessHours,
  parseStringArrayOrNull,
  parseBusinessAttributes,
} from '@/shared/lib/json-validators'
import { maskSecretKey } from '@/admin/lib/stripe'
import { extractServiceAccountEmail } from '@/shared/lib/google-calendar'
import { getSession, getRoleFromSession } from '@/shared/lib/auth'
import { hasPermission, canAccessAdmin } from '@/admin/lib/permissions'
import { logPermissionDenied } from '@/admin/lib/audit'

import type { SettingsData } from './types'
import {
  basicInfoSchema,
  layoutSettingsSchema,
  seoSettingsSchema,
  type BasicInfoInput,
  type LayoutSettingsInput,
  type SeoSettingsInput,
} from './schemas'

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * 読み取り権限チェック（読み取りアクションは権限なしなら空結果を返す）
 */
async function checkReadPermission(): Promise<boolean> {
  const session = await getSession()
  if (!session?.user) return false
  const role = getRoleFromSession(session)
  if (!role) return false
  if (!canAccessAdmin(role)) return false
  if (!hasPermission(role, 'settings', 'read')) {
    void logPermissionDenied(session.user.id, 'settings', 'read')
    return false
  }
  return true
}

// =============================================================================
// Actions
// =============================================================================

/**
 * 設定を取得（公開ページ用・認証不要）
 * 機密情報（Stripeキー等）はマスク済みまたは除外
 */
export async function getPublicSettings(): Promise<SettingsData> {
  let settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
  })

  if (!settings) {
    settings = await prisma.settings.create({
      data: { id: 'singleton' },
    })
  }

  // Prisma JsonValueをZodバリデーション関数で安全に変換
  // 機密情報はnullとして返す（公開ページでは不要）
  return {
    ...settings,
    businessHours: parseBusinessHours(settings.businessHours),
    regularHolidays: parseStringArrayOrNull(settings.regularHolidays),
    specialHolidays: parseStringArrayOrNull(settings.specialHolidays),

    stripeSecretKeyMasked: null, // 機密情報は公開しない
    stripeWebhookSecretMasked: null,
    googleCalendarServiceAccountEmailMasked: null,
    // Two-Way Sync Settings
    googleCalendarTwoWaySyncEnabled: settings.googleCalendarTwoWaySyncEnabled,
    googleCalendarSyncMethod: settings.googleCalendarSyncMethod,
    googleCalendarPollingIntervalMin: settings.googleCalendarPollingIntervalMin,
    googleCalendarLastSyncedAt: settings.googleCalendarLastSyncedAt,
    googleCalendarWebhookActive: !!settings.googleCalendarWebhookChannelId,
    googleCalendarWebhookExpiration: settings.googleCalendarWebhookExpiration,
    // Layout Width Settings
    containerWidth: settings.containerWidth,
    containerWidthCustom: settings.containerWidthCustom,
    contentWidth: settings.contentWidth,
    contentWidthCustom: settings.contentWidthCustom,
    // Sidebar Settings
    sidebarEnabled: settings.sidebarEnabled,
    sidebarWidgets: settings.sidebarWidgets,
    sidebarRecentCount: settings.sidebarRecentCount,
    sidebarPopularCount: settings.sidebarPopularCount,
    // MEO Settings (ローカル検索最適化)
    latitude: settings.latitude,
    longitude: settings.longitude,
    priceRange: settings.priceRange,
    googleBusinessPlaceId: settings.googleBusinessPlaceId,
    googleReviewUrl: settings.googleReviewUrl,
    businessAttributes: parseBusinessAttributes(settings.businessAttributes),
    paymentAccepted: settings.paymentAccepted,
    // Tax Settings (Decimal → number変換)
    taxStandardRate: Number(settings.taxStandardRate),
    taxReducedRate: Number(settings.taxReducedRate),
    taxDisplayModeAdmin: settings.taxDisplayModeAdmin,
    taxDisplayModePublic: settings.taxDisplayModePublic,
    taxInputMode: settings.taxInputMode,
  }
}

/**
 * 設定を取得（管理画面用）
 */
export async function getSettings(): Promise<SettingsData | null> {
  const hasAccess = await checkReadPermission()
  if (!hasAccess) {
    return null
  }

  let settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
  })

  if (!settings) {
    settings = await prisma.settings.create({
      data: { id: 'singleton' },
    })
  }

  // Stripeキーをマスク表示用に変換
  const stripeSecretKeyMasked = settings.stripeSecretKey
    ? maskSecretKey(safeDecrypt(settings.stripeSecretKey) || '****')
    : null
  const stripeWebhookSecretMasked = settings.stripeWebhookSecret
    ? maskSecretKey(safeDecrypt(settings.stripeWebhookSecret) || '****')
    : null

  // Google Calendarサービスアカウントのメールをマスク表示用に抽出
  let googleCalendarServiceAccountEmailMasked: string | null = null
  if (settings.googleCalendarServiceAccountJson) {
    const decrypted = safeDecrypt(settings.googleCalendarServiceAccountJson)
    if (decrypted) {
      const email = extractServiceAccountEmail(decrypted)
      if (email) {
        // メールアドレスをマスク（例: ser****@project.iam.gserviceaccount.com）
        const [localPart, domain] = email.split('@')
        googleCalendarServiceAccountEmailMasked =
          localPart.slice(0, 3) + '****@' + domain
      }
    }
  }

  // Prisma JsonValueをZodバリデーション関数で安全に変換 + Stripeキーはマスク済みで返す
  return {
    ...settings,
    businessHours: parseBusinessHours(settings.businessHours),
    regularHolidays: parseStringArrayOrNull(settings.regularHolidays),
    specialHolidays: parseStringArrayOrNull(settings.specialHolidays),

    stripeSecretKeyMasked,
    stripeWebhookSecretMasked,
    googleCalendarServiceAccountEmailMasked,
    // Two-Way Sync Settings
    googleCalendarTwoWaySyncEnabled: settings.googleCalendarTwoWaySyncEnabled,
    googleCalendarSyncMethod: settings.googleCalendarSyncMethod,
    googleCalendarPollingIntervalMin: settings.googleCalendarPollingIntervalMin,
    googleCalendarLastSyncedAt: settings.googleCalendarLastSyncedAt,
    googleCalendarWebhookActive: !!settings.googleCalendarWebhookChannelId,
    googleCalendarWebhookExpiration: settings.googleCalendarWebhookExpiration,
    // Layout Width Settings
    containerWidth: settings.containerWidth,
    containerWidthCustom: settings.containerWidthCustom,
    contentWidth: settings.contentWidth,
    contentWidthCustom: settings.contentWidthCustom,
    // Sidebar Settings
    sidebarEnabled: settings.sidebarEnabled,
    sidebarWidgets: settings.sidebarWidgets,
    sidebarRecentCount: settings.sidebarRecentCount,
    sidebarPopularCount: settings.sidebarPopularCount,
    // MEO Settings (ローカル検索最適化)
    latitude: settings.latitude,
    longitude: settings.longitude,
    priceRange: settings.priceRange,
    googleBusinessPlaceId: settings.googleBusinessPlaceId,
    googleReviewUrl: settings.googleReviewUrl,
    businessAttributes: parseBusinessAttributes(settings.businessAttributes),
    paymentAccepted: settings.paymentAccepted,
    // Tax Settings (Decimal → number変換)
    taxStandardRate: Number(settings.taxStandardRate),
    taxReducedRate: Number(settings.taxReducedRate),
    taxDisplayModeAdmin: settings.taxDisplayModeAdmin,
    taxDisplayModePublic: settings.taxDisplayModePublic,
    taxInputMode: settings.taxInputMode,
  }
}

/**
 * 基本情報を更新
 */
export const updateBasicInfo = withPermission<[data: BasicInfoInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = basicInfoSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...parsed.data },
    update: parsed.data,
  })

  updateTag(CACHE_TAGS.SETTINGS)
  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('基本情報を更新しました')
})

/**
 * レイアウト設定を更新
 */
export const updateLayoutSettings = withPermission<[data: LayoutSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = layoutSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  // CUSTOMを選択している場合はカスタム値が必須
  if (parsed.data.containerWidth === 'CUSTOM' && !parsed.data.containerWidthCustom) {
    return createFailure('Container幅のカスタム値を入力してください')
  }
  if (parsed.data.contentWidth === 'CUSTOM' && !parsed.data.contentWidthCustom) {
    return createFailure('コンテンツ幅のカスタム値を入力してください')
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      containerWidth: parsed.data.containerWidth,
      containerWidthCustom: parsed.data.containerWidth === 'CUSTOM' ? parsed.data.containerWidthCustom : null,
      contentWidth: parsed.data.contentWidth,
      contentWidthCustom: parsed.data.contentWidth === 'CUSTOM' ? parsed.data.contentWidthCustom : null,
    },
    update: {
      containerWidth: parsed.data.containerWidth,
      containerWidthCustom: parsed.data.containerWidth === 'CUSTOM' ? parsed.data.containerWidthCustom : null,
      contentWidth: parsed.data.contentWidth,
      contentWidthCustom: parsed.data.contentWidth === 'CUSTOM' ? parsed.data.contentWidthCustom : null,
    },
  })

  updateTag(CACHE_TAGS.SETTINGS)
  updateTag(CACHE_TAGS.SETTINGS)
  updateTag(CACHE_TAGS.SETTINGS)
  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('レイアウト設定を更新しました')
})

/**
 * SEO設定を更新
 */
export const updateSeoSettings = withPermission<[data: SeoSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = seoSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...parsed.data },
    update: parsed.data,
  })

  // Analytics設定キャッシュを即座に無効化
  updateTag(CACHE_TAGS.SETTINGS)
  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('SEO設定を更新しました')
})
