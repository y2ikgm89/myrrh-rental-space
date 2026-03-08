/**
 * Instagram Token Refresh Cron API
 *
 * Cloud Schedulerまたは外部スケジューラーから定期的に呼び出され、
 * Instagramアクセストークンの自動更新を実行します。
 *
 * ## 機能
 * - 有効期限10日以内のトークンを自動更新
 * - 更新失敗時のエラーログ記録
 *
 * @module api/cron/instagram-refresh
 */

import { connection } from 'next/server'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  getInstagramRefreshState,
} from '@/shared/domain/instagram/queries'
import {
  refreshInstagramAccessToken,
} from '@/shared/domain/instagram/commands'
import { refreshLongLivedToken, getTokenExpiryDays } from '@/shared/lib/instagram'
import { safeDecrypt } from '@/shared/lib/crypto'
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from '@/shared/lib/errors/server'
import { serverEnv } from '@/shared/lib/env/server'

/** トークン更新を開始する残り日数（10日） */
const REFRESH_THRESHOLD_DAYS = 10

/**
 * Instagram Token Refresh Cronエンドポイント
 * GET /api/cron/instagram-refresh
 *
 * Cloud Schedulerまたは外部スケジューラーから呼び出される
 * 毎日1回実行を推奨
 *
 * セキュリティ: CRON_SECRET環境変数による認証
 */
export async function GET() {
  // Next.js 16: connection() でプリレンダリングをオプトアウト
  await connection()

  try {
    // Next.js 16: headers() で動的にヘッダーを取得
    const headersList = await headers()
    const authHeader = headersList.get('authorization')
    const cronSecret = serverEnv.CRON_SECRET

    // 本番環境ではCRON_SECRETを必須とする
    if (!cronSecret && serverEnv.NODE_ENV === 'production') {
      logError(new Error('CRON_SECRET is not set in production environment'), {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.CRITICAL,
        context: { operation: 'instagramTokenRefreshCron' },
      })
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    // 開発環境で認証をスキップする場合は警告ログ
    if (!cronSecret && serverEnv.NODE_ENV !== 'production') {
      logError(
        new Error(
          'CRON_SECRET is not set - authentication skipped in development'
        ),
        {
          category: ErrorCategory.AUTHORIZATION,
          severity: ErrorSeverity.LOW,
          context: {
            operation: 'instagramTokenRefreshCron',
            environment: serverEnv.NODE_ENV,
          },
        }
      )
    }

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Instagram設定を取得
    const settings = await getInstagramRefreshState()

    // トークンが設定されていない場合はスキップ
    if (!settings.encryptedAccessToken || !settings.tokenExpiresAt) {
      return NextResponse.json({
        success: true,
        message: 'No Instagram token configured',
        skipped: true,
      })
    }

    // 有効期限までの残り日数を計算
    const daysRemaining = getTokenExpiryDays(settings.tokenExpiresAt)

    // 残り日数が閾値以上ならスキップ
    if (daysRemaining > REFRESH_THRESHOLD_DAYS) {
      return NextResponse.json({
        success: true,
        message: `Token is still valid (${daysRemaining} days remaining)`,
        skipped: true,
        daysRemaining,
      })
    }

    // トークンを復号
    const decryptedToken = safeDecrypt(settings.encryptedAccessToken)
    if (!decryptedToken) {
      logError(new Error('Failed to decrypt Instagram access token'), {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.HIGH,
        context: { operation: 'instagramTokenRefreshCron' },
      })
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to decrypt access token',
        },
        { status: 500 }
      )
    }

    // トークンをリフレッシュ
    const refreshResult = await refreshLongLivedToken(decryptedToken)

    // 新しい有効期限を計算（現在時刻 + expires_in秒）
    const newExpiresAt = new Date(
      Date.now() + refreshResult.expiresIn * 1000
    )

    // 新しいトークンを暗号化して保存
    await refreshInstagramAccessToken({
      accessToken: refreshResult.accessToken,
      expiresAt: newExpiresAt,
    })

    const newDaysRemaining = getTokenExpiryDays(newExpiresAt)

    return NextResponse.json({
      success: true,
      message: 'Token refreshed successfully',
      previousDaysRemaining: daysRemaining,
      newDaysRemaining,
      newExpiresAt: newExpiresAt.toISOString(),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: 'instagramTokenRefreshCron' },
    })
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
