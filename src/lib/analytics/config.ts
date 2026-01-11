/**
 * Analytics設定取得ヘルパー
 *
 * DBからAnalytics関連の設定を取得する
 * unstable_cacheでキャッシュし、設定変更時にrevalidateTagで無効化
 */

import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'

export type AnalyticsConfig = {
  analyticsType: 'ga4' | 'gtm' | null
  googleAnalyticsId: string | null
  googleTagManagerId: string | null
  googleSearchConsoleId: string | null
  bingWebmasterToolsId: string | null
  gaPropertyId: string | null
}

/**
 * デフォルトのAnalytics設定（DB取得失敗時のフォールバック）
 */
function getDefaultAnalyticsConfig(): AnalyticsConfig {
  return {
    analyticsType: null,
    googleAnalyticsId: null,
    googleTagManagerId: null,
    googleSearchConsoleId: null,
    bingWebmasterToolsId: null,
    gaPropertyId: null,
  }
}

/**
 * Analytics設定を取得（キャッシュ付き）
 *
 * - 1時間キャッシュ
 * - 設定変更時は revalidateTag('analytics-config') で無効化
 */
export const getAnalyticsConfig = unstable_cache(
  async (): Promise<AnalyticsConfig> => {
    try {
      const settings = await prisma.settings.findUnique({
        where: { id: 'singleton' },
        select: {
          analyticsType: true,
          googleAnalyticsId: true,
          googleTagManagerId: true,
          googleSearchConsoleId: true,
          bingWebmasterToolsId: true,
          gaPropertyId: true,
        },
      })

      if (!settings) {
        return getDefaultAnalyticsConfig()
      }

      return {
        analyticsType: (settings.analyticsType as 'ga4' | 'gtm' | null) ?? null,
        googleAnalyticsId: settings.googleAnalyticsId ?? null,
        googleTagManagerId: settings.googleTagManagerId ?? null,
        googleSearchConsoleId: settings.googleSearchConsoleId ?? null,
        bingWebmasterToolsId: settings.bingWebmasterToolsId ?? null,
        gaPropertyId: settings.gaPropertyId ?? null,
      }
    } catch (error) {
      console.error('Failed to fetch analytics config:', error)
      return getDefaultAnalyticsConfig()
    }
  },
  ['analytics-config'],
  { tags: ['analytics-config'], revalidate: 3600 }
)
