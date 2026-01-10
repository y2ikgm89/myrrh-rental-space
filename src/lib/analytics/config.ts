/**
 * Analytics設定取得ヘルパー
 *
 * DBからAnalytics関連の設定を取得する
 */

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
 * Analytics設定を取得
 *
 * Server Componentから呼び出し、キャッシュされる
 */
export async function getAnalyticsConfig(): Promise<AnalyticsConfig> {
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

  return {
    analyticsType: (settings?.analyticsType as 'ga4' | 'gtm' | null) ?? null,
    googleAnalyticsId: settings?.googleAnalyticsId ?? null,
    googleTagManagerId: settings?.googleTagManagerId ?? null,
    googleSearchConsoleId: settings?.googleSearchConsoleId ?? null,
    bingWebmasterToolsId: settings?.bingWebmasterToolsId ?? null,
    gaPropertyId: settings?.gaPropertyId ?? null,
  }
}
