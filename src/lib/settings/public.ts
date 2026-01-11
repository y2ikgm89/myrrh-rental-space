/**
 * 公開ページ向け設定取得関数
 *
 * 認証不要で取得可能な設定のみを返す
 * Next.js 16 use cache ディレクティブによる明示的キャッシュ制御
 */

import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { safeFetch, ErrorCategory, ErrorSeverity } from '@/lib/errors'

/** お知らせバー設定のデフォルト値 */
const DEFAULT_ANNOUNCEMENT_BAR_SETTINGS = {
  announcementBarAnimation: 'fade' as const,
  announcementBarDuration: 5000,
  announcementBarAutoPlay: true,
  announcementBarPauseOnHover: true,
  announcementBarShowArrows: true,
  announcementBarShowIndicator: true,
  announcementBarDesignStyle: 'solid' as const,
  announcementBarBgColor: null,
  announcementBarTextColor: null,
  announcementBarStripeColor: null,
  announcementBarStripeAnimation: false,
  announcementBarGradientAnimation: false,
  announcementBarGlassAnimation: false,
}

/**
 * Cookie同意設定を取得
 * キャッシュ: 1時間、設定更新時に無効化
 */
export async function getCookieConsentSettings() {
  'use cache'
  cacheLife('hours')
  cacheTag('cookie-consent', 'settings')

  return safeFetch({
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
}

/**
 * 公開用ビジネス設定を取得（About/Contact等で使用）
 * キャッシュ: 1時間、設定更新時に無効化
 */
export async function getPublicBusinessSettings() {
  'use cache'
  cacheLife('hours')
  cacheTag('business-settings', 'settings')

  return safeFetch({
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
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: 'getPublicBusinessSettings',
  })
}

/**
 * お知らせバーカルーセル設定を取得
 * キャッシュ: 1時間、設定更新時に無効化
 */
export async function getAnnouncementBarCarouselSettingsCached() {
  'use cache'
  cacheLife('hours')
  cacheTag('announcement-bar', 'settings')

  return safeFetch({
    fetch: async () => {
      const settings = await prisma.settings.findFirst({
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
        },
      })
      return settings ?? DEFAULT_ANNOUNCEMENT_BAR_SETTINGS
    },
    fallback: DEFAULT_ANNOUNCEMENT_BAR_SETTINGS,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: 'getAnnouncementBarCarouselSettings',
  })
}

/**
 * 有効なお知らせバー一覧を取得（フロントエンド用）
 * キャッシュ: 5分、お知らせバー更新時に無効化
 *
 * Note: 表示期間（startAt/endAt）のフィルタリングはクライアントサイドで実行
 */
export async function getActiveAnnouncementBarsCached() {
  'use cache'
  cacheLife('minutes')
  cacheTag('announcement-bar')

  return safeFetch({
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
}

/**
 * 設定キャッシュを無効化
 * 設定更新時にServer Actionから呼び出す
 */
export { revalidateTag } from 'next/cache'
