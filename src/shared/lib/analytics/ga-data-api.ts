/**
 * Google Analytics Data API クライアント
 *
 * GA4からアクセス解析データを取得するためのクライアント。
 * サービスアカウント認証を使用します。
 *
 * ## 機能
 * - GA4基本統計の取得
 * - 人気ページランキング取得
 * - API可用性チェック
 *
 * @see https://developers.google.com/analytics/devguides/reporting/data/v1
 * @module shared/lib/analytics/ga-data-api
 */

import 'server-only'
import { BetaAnalyticsDataClient } from '@google-analytics/data'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'

// =============================================================================
// Types
// =============================================================================

export type AnalyticsStats = {
  pageViews: number
  users: number
  sessions: number
  averageSessionDuration: number
  topPages: Array<{
    path: string
    title: string
    views: number
  }>
}

export type AnalyticsError = {
  code: 'NO_CREDENTIALS' | 'INVALID_PROPERTY' | 'API_ERROR' | 'UNKNOWN'
  message: string
}

// =============================================================================
// Client
// =============================================================================

/**
 * GA Data APIクライアントを取得
 *
 * 環境変数 GOOGLE_APPLICATION_CREDENTIALS_JSON からクレデンシャルを読み込む
 */
function getAnalyticsClient(): BetaAnalyticsDataClient | null {
  const credentialsJson = process.env["GOOGLE_APPLICATION_CREDENTIALS_JSON"]

  if (!credentialsJson) {
    return null
  }

  try {
    const credentials = JSON.parse(credentialsJson)
    return new BetaAnalyticsDataClient({ credentials })
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON'), {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.HIGH,
      context: { operation: 'getAnalyticsClient' },
    })
    return null
  }
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * GA4から基本統計を取得
 *
 * @param propertyId - GA4プロパティID（数値のみ）
 * @param startDate - 開始日（デフォルト: 30日前）
 * @param endDate - 終了日（デフォルト: 今日）
 */
export async function getAnalyticsStats(
  propertyId: string,
  startDate: string = '30daysAgo',
  endDate: string = 'today'
): Promise<{ success: true; data: AnalyticsStats } | { success: false; error: AnalyticsError }> {
  const client = getAnalyticsClient()

  if (!client) {
    return {
      success: false,
      error: {
        code: 'NO_CREDENTIALS',
        message: 'Google Analytics APIのクレデンシャルが設定されていません',
      },
    }
  }

  if (!propertyId || !/^\d+$/.test(propertyId)) {
    return {
      success: false,
      error: {
        code: 'INVALID_PROPERTY',
        message: 'GA4プロパティIDが無効です',
      },
    }
  }

  try {
    // 基本統計の取得
    const [basicResponse] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'totalUsers' },
        { name: 'sessions' },
        { name: 'averageSessionDuration' },
      ],
    })

    // 人気ページTop5
    const [pagesResponse] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 5,
    })

    const basicRow = basicResponse.rows?.[0]

    return {
      success: true,
      data: {
        pageViews: parseInt(basicRow?.metricValues?.[0]?.value || '0'),
        users: parseInt(basicRow?.metricValues?.[1]?.value || '0'),
        sessions: parseInt(basicRow?.metricValues?.[2]?.value || '0'),
        averageSessionDuration: parseFloat(
          basicRow?.metricValues?.[3]?.value || '0'
        ),
        topPages: (pagesResponse.rows || []).map((row) => ({
          path: row.dimensionValues?.[0]?.value || '',
          title: row.dimensionValues?.[1]?.value || '',
          views: parseInt(row.metricValues?.[0]?.value || '0'),
        })),
      },
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'getAnalyticsStats', propertyId },
    })
    return {
      success: false,
      error: {
        code: 'API_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Google Analytics APIの呼び出しに失敗しました',
      },
    }
  }
}

/**
 * GA Data APIが利用可能かチェック
 */
export function isAnalyticsApiAvailable(): boolean {
  return !!process.env["GOOGLE_APPLICATION_CREDENTIALS_JSON"]
}
