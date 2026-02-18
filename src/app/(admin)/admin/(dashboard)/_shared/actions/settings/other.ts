'use server'

/**
 * その他の設定 Server Actions
 * - メンテナンス設定
 * - Cookie同意設定
 * - 規約同意設定
 * - 予約設定
 * - サイドバー設定
 * - お知らせバーカルーセル設定
 *
 * @module admin/actions/settings/other
 */

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { sidebarSettingsSchema } from '@/shared/lib/validations/sidebar'
import { TermsType, TermsStatus, AnnouncementBarAnimation, AnnouncementBarDesignStyle, PostPermalinkStructure } from '@/shared/generated/prisma/enums'

import {
  maintenanceSettingsSchema,
  cookieConsentSettingsSchema,
  termsAgreementSettingsSchema,
  reservationSettingsSchema,
  announcementBarCarouselSettingsSchema,
  permalinkSettingsSchema,
  headerSettingsSchema,
  type MaintenanceSettingsInput,
  type CookieConsentSettingsInput,
  type TermsAgreementSettingsInput,
  type ReservationSettingsInput,
  type AnnouncementBarCarouselSettingsInput,
  type PermalinkSettingsInput,
  type HeaderSettingsInput,
  type SidebarSettingsInput,
} from './schemas'

// =============================================================================
// Maintenance Actions
// =============================================================================

/**
 * メンテナンス設定を更新
 */
export const updateMaintenanceSettings = withPermission<[data: MaintenanceSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = maintenanceSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...parsed.data },
    update: parsed.data,
  })

  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('メンテナンス設定を更新しました')
})

// =============================================================================
// Cookie Consent Actions
// =============================================================================

/**
 * Cookie同意設定を更新
 */
export const updateCookieConsentSettings = withPermission<[data: CookieConsentSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = cookieConsentSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...parsed.data },
    update: parsed.data,
  })

  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('Cookie同意設定を更新しました')
})

// =============================================================================
// Terms Agreement Actions
// =============================================================================

/**
 * 規約同意設定を取得（公開サイト用）
 */
export async function getTermsAgreementSettings(): Promise<{
  enabled: boolean
  text: string | null
  requireTerms: boolean
  requirePrivacy: boolean
}> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      termsAgreementEnabled: true,
      termsAgreementText: true,
      requireTermsAgreement: true,
      requirePrivacyAgreement: true,
    },
  })

  if (!settings) {
    return {
      enabled: true,
      text: null,
      requireTerms: true,
      requirePrivacy: true,
    }
  }

  return {
    enabled: settings.termsAgreementEnabled,
    text: settings.termsAgreementText,
    requireTerms: settings.requireTermsAgreement,
    requirePrivacy: settings.requirePrivacyAgreement,
  }
}

/**
 * 規約同意設定を更新（管理画面用）
 */
export const updateTermsAgreementSettings = withPermission<[data: TermsAgreementSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = termsAgreementSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...parsed.data },
    update: parsed.data,
  })

  updateTag(CACHE_TAGS.SETTINGS)
  updateTag(CACHE_TAGS.RESERVATIONS)

  return createSuccess('規約同意設定を更新しました')
})

// =============================================================================
// Reservation Actions
// =============================================================================

/**
 * キャンセルポリシー（利用規約）一覧を取得
 * 予約設定画面でのセレクトボックス用
 * 公開済みバージョンがあるもののみ返す
 */
export async function getCancellationPolicies(): Promise<
  Array<{
    id: string
    title: string
    updatedAt: Date
  }>
> {
  const terms = await prisma.terms.findMany({
    where: {
      type: TermsType.CANCELLATION,
      isActive: true,
      // 公開済みバージョンがあるもののみ
      versions: {
        some: {
          status: TermsStatus.PUBLISHED,
        },
      },
    },
    select: {
      id: true,
      title: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  })

  return terms
}

/**
 * 予約設定を更新
 */
export const updateReservationSettings = withPermission<[data: ReservationSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = reservationSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  // cancellationTermsIdが指定されている場合、有効なCANCELLATIONタイプか検証
  if (parsed.data.cancellationTermsId) {
    const termsExists = await prisma.terms.findFirst({
      where: {
        id: parsed.data.cancellationTermsId,
        type: TermsType.CANCELLATION,
        isActive: true,
        versions: {
          some: {
            status: TermsStatus.PUBLISHED,
          },
        },
      },
    })
    if (!termsExists) {
      return createFailure('指定されたキャンセルポリシーが見つかりません。有効な公開済みポリシーを選択してください。')
    }
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...parsed.data },
    update: parsed.data,
  })

  updateTag(CACHE_TAGS.SETTINGS)
  updateTag(CACHE_TAGS.TERMS)

  return createSuccess('予約設定を更新しました')
})

// =============================================================================
// Sidebar Actions
// =============================================================================

/**
 * サイドバー設定を更新
 */
export const updateSidebarSettings = withPermission<[data: SidebarSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = sidebarSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      sidebarEnabled: parsed.data.sidebarEnabled,
      sidebarWidgets: parsed.data.sidebarWidgets,
      sidebarRecentCount: parsed.data.sidebarRecentCount,
      sidebarPopularCount: parsed.data.sidebarPopularCount,
    },
    update: {
      sidebarEnabled: parsed.data.sidebarEnabled,
      sidebarWidgets: parsed.data.sidebarWidgets,
      sidebarRecentCount: parsed.data.sidebarRecentCount,
      sidebarPopularCount: parsed.data.sidebarPopularCount,
    },
  })

  updateTag(CACHE_TAGS.SETTINGS)
  updateTag(CACHE_TAGS.POSTS)

  return createSuccess('サイドバー設定を更新しました')
})

// =============================================================================
// Announcement Bar Carousel Actions
// =============================================================================

/**
 * お知らせバーカルーセル設定を取得（フロントエンド用）
 */
export async function getAnnouncementBarCarouselSettings(): Promise<AnnouncementBarCarouselSettingsInput> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      announcementBarAnimation: true,
      announcementBarDuration: true,
      announcementBarAutoPlay: true,
      announcementBarPauseOnHover: true,
      announcementBarShowArrows: true,
      announcementBarShowIndicator: true,
      announcementBarDesignStyle: true,
      announcementBarBgColor: true,
      announcementBarTextColor: true,
      announcementBarStripeColor: true,
      announcementBarStripeAnimation: true,
      announcementBarGradientAnimation: true,
      announcementBarGlassAnimation: true,
      announcementBarSticky: true,
    },
  })

  return {
    announcementBarAnimation: settings?.announcementBarAnimation ?? AnnouncementBarAnimation.fade,
    announcementBarDuration: settings?.announcementBarDuration ?? 5000,
    announcementBarAutoPlay: settings?.announcementBarAutoPlay ?? true,
    announcementBarPauseOnHover: settings?.announcementBarPauseOnHover ?? true,
    announcementBarShowArrows: settings?.announcementBarShowArrows ?? true,
    announcementBarShowIndicator: settings?.announcementBarShowIndicator ?? true,
    announcementBarDesignStyle: settings?.announcementBarDesignStyle ?? AnnouncementBarDesignStyle.solid,
    announcementBarBgColor: settings?.announcementBarBgColor ?? null,
    announcementBarTextColor: settings?.announcementBarTextColor ?? null,
    announcementBarStripeColor: settings?.announcementBarStripeColor ?? null,
    announcementBarStripeAnimation: settings?.announcementBarStripeAnimation ?? false,
    announcementBarGradientAnimation: settings?.announcementBarGradientAnimation ?? false,
    announcementBarGlassAnimation: settings?.announcementBarGlassAnimation ?? false,
    announcementBarSticky: settings?.announcementBarSticky ?? false,
  }
}

/**
 * お知らせバーカルーセル設定を更新
 */
export const updateAnnouncementBarCarouselSettings = withPermission<[data: AnnouncementBarCarouselSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = announcementBarCarouselSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...parsed.data },
    update: parsed.data,
  })

  updateTag(CACHE_TAGS.SETTINGS)

  return createSuccess('お知らせバーカルーセル設定を更新しました')
})

// =============================================================================
// Permalink Actions
// =============================================================================

/**
 * パーマリンク設定を取得（公開サイト用）
 *
 * 全URLはルートレベルで生成されます。
 * - post-name: /slug
 * - date-name: /2026/01/slug
 * - category-name: /category/slug
 */
export async function getPermalinkSettings(): Promise<{
  postPermalinkStructure: string
}> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      postPermalinkStructure: true,
    },
  })

  return {
    postPermalinkStructure: settings?.postPermalinkStructure ?? PostPermalinkStructure.post_name,
  }
}

/**
 * パーマリンク設定を更新（管理画面用）
 */
export const updatePermalinkSettings = withPermission<[data: PermalinkSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = permalinkSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...parsed.data },
    update: parsed.data,
  })

  updateTag(CACHE_TAGS.SETTINGS)
  updateTag(CACHE_TAGS.POSTS)

  return createSuccess('パーマリンク設定を更新しました')
})

// =============================================================================
// Header Settings Actions
// =============================================================================

/**
 * ヘッダー設定を更新（スクロール動作 + 背景モード）
 */
export const updateHeaderSettings = withPermission<[data: HeaderSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = headerSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...parsed.data },
    update: parsed.data,
  })

  updateTag(CACHE_TAGS.SETTINGS)
  updateTag(CACHE_TAGS.LAYOUT_SETTINGS)

  return createSuccess('ヘッダー設定を更新しました')
})
