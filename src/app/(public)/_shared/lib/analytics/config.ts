/**
 * Analytics設定取得ヘルパー
 *
 * DBからAnalytics関連の設定を取得する
 * Next.js 16 'use cache' ディレクティブによる明示的キャッシュ制御
 *
 * @module public/lib/analytics/config
 */

import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/shared/lib/prisma'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'

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
 * Next.js 16 'use cache' パターン:
 * - cacheLife('hours'): 1時間キャッシュ
 * - cacheTag: 設定変更時に revalidateTag('analytics-config') で無効化
 */
export async function getAnalyticsConfig(): Promise<AnalyticsConfig> {
  'use cache'
  cacheLife('hours')
  cacheTag('analytics-config', 'settings')

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

    // プレーンオブジェクトとして返す（シリアライズ可能）
    return {
      analyticsType: (settings.analyticsType as 'ga4' | 'gtm' | null) ?? null,
      googleAnalyticsId: settings.googleAnalyticsId ?? null,
      googleTagManagerId: settings.googleTagManagerId ?? null,
      googleSearchConsoleId: settings.googleSearchConsoleId ?? null,
      bingWebmasterToolsId: settings.bingWebmasterToolsId ?? null,
      gaPropertyId: settings.gaPropertyId ?? null,
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: 'getAnalyticsConfig' },
    })
    return getDefaultAnalyticsConfig()
  }
}
