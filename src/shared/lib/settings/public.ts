/**
 * 公開ページ向け設定取得関数
 *
 * 認証不要で取得可能な設定のみを返す
 * Next.js 16 use cache ディレクティブによる明示的キャッシュ制御
 *
 * React 19 対応:
 * - Prisma オブジェクトをプレーンオブジェクトに変換してから返す
 * - Symbol プロパティを含むオブジェクトは Client Components に渡せないため
 */

import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/shared/lib/prisma'
import { CACHE_TAGS, CACHE_LIFE } from '@/shared/lib/constants'
import { safeFetch, ErrorCategory, ErrorSeverity } from '@/shared/lib/errors/server'
import { toPlainObject, toPlainArray } from '@/shared/lib/serialize'
import { AnnouncementBarAnimation, AnnouncementBarDesignStyle, LayoutWidth, PostPermalinkStructure } from '@/shared/generated/prisma/enums'

/** お知らせバー設定のデフォルト値 */
interface AnnouncementBarSettings {
  announcementBarAnimation: string
  announcementBarDuration: number
  announcementBarAutoPlay: boolean
  announcementBarPauseOnHover: boolean
  announcementBarShowArrows: boolean
  announcementBarShowIndicator: boolean
  announcementBarDesignStyle: string
  announcementBarBgColor: string | null
  announcementBarTextColor: string | null
  announcementBarStripeColor: string | null
  announcementBarStripeAnimation: boolean
  announcementBarGradientAnimation: boolean
  announcementBarGlassAnimation: boolean
  announcementBarSticky: boolean
}

const DEFAULT_ANNOUNCEMENT_BAR_SETTINGS: AnnouncementBarSettings = {
  announcementBarAnimation: AnnouncementBarAnimation.fade,
  announcementBarDuration: 5000,
  announcementBarAutoPlay: true,
  announcementBarPauseOnHover: true,
  announcementBarShowArrows: true,
  announcementBarShowIndicator: true,
  announcementBarDesignStyle: AnnouncementBarDesignStyle.solid,
  announcementBarBgColor: null,
  announcementBarTextColor: null,
  announcementBarStripeColor: null,
  announcementBarStripeAnimation: false,
  announcementBarGradientAnimation: false,
  announcementBarGlassAnimation: false,
  announcementBarSticky: false,
}

/**
 * Cookie同意設定を取得
 * キャッシュ: 1時間、設定更新時に無効化
 */
export async function getCookieConsentSettings() {
  'use cache'
  cacheLife(CACHE_LIFE.STATIC_SETTINGS)
  cacheTag(CACHE_TAGS.COOKIE_CONSENT, CACHE_TAGS.SETTINGS)

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: 'singleton' },
        select: {
          cookieConsentEnabled: true,
          cookieConsentMessage: true,
          cookieConsentAcceptText: true,
          cookieConsentRejectText: true,
          cookieConsentPolicyUrl: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: 'getCookieConsentSettings',
  })

  return toPlainObject(result)
}

/**
 * 公開用ビジネス設定を取得（About/Contact等で使用）
 * キャッシュ: 1時間、設定更新時に無効化
 */
export async function getPublicBusinessSettings() {
  'use cache'
  cacheLife(CACHE_LIFE.STATIC_SETTINGS)
  cacheTag(CACHE_TAGS.BUSINESS_SETTINGS, CACHE_TAGS.SETTINGS)

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: 'singleton' },
        select: {
          siteName: true,
          siteDescription: true,
          businessName: true,
          businessNameKana: true,
          businessDescription: true,
          businessType: true,
          representativeName: true,
          establishedDate: true,
          registrationNumber: true,
          invoiceNumber: true,
          email: true,
          phoneNumber: true,
          address: true,
          postalCode: true,
          prefecture: true,
          city: true,
          streetAddress: true,
          buildingName: true,
          businessHours: true,
          holidayNotice: true,
          googleReviewUrl: true,
          googleBusinessPlaceId: true,
          businessAttributes: true,
          paymentAccepted: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: 'getPublicBusinessSettings',
  })

  return toPlainObject(result)
}

/**
 * お知らせバーカルーセル設定を取得
 * キャッシュ: 1時間、設定更新時に無効化
 */
export async function getAnnouncementBarCarouselSettingsCached() {
  'use cache'
  cacheLife(CACHE_LIFE.STATIC_SETTINGS)
  cacheTag(CACHE_TAGS.ANNOUNCEMENT_BAR, CACHE_TAGS.SETTINGS)

  const result = await safeFetch({
    fetch: async () => {
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
      return settings ?? DEFAULT_ANNOUNCEMENT_BAR_SETTINGS
    },
    fallback: DEFAULT_ANNOUNCEMENT_BAR_SETTINGS,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: 'getAnnouncementBarCarouselSettings',
  })

  return toPlainObject(result)
}

/**
 * 有効なお知らせバー一覧を取得（フロントエンド用）
 * キャッシュ: 5分、お知らせバー更新時に無効化
 *
 * Note: 表示期間（startAt/endAt）のフィルタリングはクライアントサイドで実行
 */
export async function getActiveAnnouncementBarsCached() {
  'use cache'
  cacheLife(CACHE_LIFE.DYNAMIC_DATA)
  cacheTag(CACHE_TAGS.ANNOUNCEMENT_BAR)

  const result = await safeFetch({
    fetch: () =>
      prisma.announcementBar.findMany({
        where: { isActive: true },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: 'getActiveAnnouncementBars',
  })

  return toPlainArray(result)
}

/**
 * パーマリンク設定を取得（公開サイト用）
 * キャッシュ: 1時間、設定更新時に無効化
 */
export async function getPermalinkSettings() {
  'use cache'
  cacheLife(CACHE_LIFE.STATIC_SETTINGS)
  cacheTag(CACHE_TAGS.PERMALINK, CACHE_TAGS.SETTINGS)

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: 'singleton' },
        select: {
          postUrlPrefixEnabled: true,
          postPermalinkStructure: true,
        },
      }),
    fallback: { postUrlPrefixEnabled: true, postPermalinkStructure: PostPermalinkStructure.post_name },
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: 'getPermalinkSettings',
  })

  return toPlainObject(result)
}

/**
 * 投稿URLプレフィックスを取得
 *
 * postUrlPrefixEnabled が true の場合は '/posts'
 * false の場合は '' (ルートレベル)
 */
export async function getPostUrlPrefix(): Promise<string> {
  const settings = await getPermalinkSettings()
  return settings?.postUrlPrefixEnabled ?? true ? '/posts' : ''
}

export async function getPublicRobotsTxtSettings() {
  'use cache'
  cacheLife(CACHE_LIFE.STATIC_SETTINGS)
  cacheTag(CACHE_TAGS.ROBOTS_TXT, CACHE_TAGS.SETTINGS)

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: 'singleton' },
        select: {
          robotsTxtEnabled: true,
          robotsTxtCustom: true,
        },
      }),
    fallback: { robotsTxtEnabled: false, robotsTxtCustom: null },
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: 'getPublicRobotsTxtSettings',
  })

  return toPlainObject(result)
}

/**
 * レイアウト設定を取得（エディタ用）
 * キャッシュ: 1時間、設定更新時に無効化
 */
export async function getLayoutSettings() {
  'use cache'
  cacheLife(CACHE_LIFE.STATIC_SETTINGS)
  cacheTag(CACHE_TAGS.LAYOUT, CACHE_TAGS.SETTINGS)

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: 'singleton' },
        select: {
          containerWidth: true,
          containerWidthCustom: true,
          contentWidth: true,
          contentWidthCustom: true,
        },
      }),
    fallback: {
      containerWidth: LayoutWidth.LG,
      containerWidthCustom: null,
      contentWidth: LayoutWidth.MD,
      contentWidthCustom: null,
    },
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: 'getLayoutSettings',
  })

  return toPlainObject(result)
}

