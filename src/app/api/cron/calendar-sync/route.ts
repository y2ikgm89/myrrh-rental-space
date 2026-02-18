/**
 * カレンダー同期 Cron API
 *
 * Cloud Schedulerまたは外部スケジューラーから定期的に呼び出され、
 * Google Calendarとの双方向同期を実行します。
 *
 * ## 機能
 * - カレンダーイベントの同期（ポーリング方式）
 * - Webhookの自動更新
 * - 同期失敗時のエラー通知
 *
 * @module api/cron/calendar-sync
 */

import { connection } from 'next/server'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { syncFromCalendar } from '@/shared/lib/calendar-sync'
import {
  isTwoWaySyncEnabled,
  getTwoWaySyncSettings,
  renewWebhookIfNeeded,
} from '@/shared/lib/google-calendar'
import { sendWebhookRenewalNotification } from '@/shared/lib/email-service'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'
import { fireAndForget } from '@/shared/lib/async-utils'
import { CalendarSyncMethod } from '@/shared/generated/prisma/enums'

/**
 * カレンダー同期用Cronエンドポイント
 * GET /api/cron/calendar-sync
 *
 * Cloud Schedulerまたは外部スケジューラーから呼び出される
 * 設定で指定された間隔（デフォルト5分）でカレンダーの変更をチェック
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
    const cronSecret = process.env["CRON_SECRET"]

    // 本番環境ではCRON_SECRETを必須とする
    if (!cronSecret && process.env["NODE_ENV"] === 'production') {
      logError(new Error('CRON_SECRET is not set in production environment'), {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.CRITICAL,
        context: { operation: 'calendarSyncCron' },
      })
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    // 開発環境で認証をスキップする場合は警告ログ
    if (!cronSecret && process.env["NODE_ENV"] !== 'production') {
      logError(new Error('CRON_SECRET is not set - authentication skipped in development'), {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.LOW,
        context: { operation: 'calendarSyncCron', environment: process.env["NODE_ENV"] },
      })
    }

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 双方向同期が有効か確認
    const enabled = await isTwoWaySyncEnabled()
    if (!enabled) {
      return NextResponse.json({
        success: true,
        message: 'Two-way sync is disabled',
        skipped: true,
      })
    }

    // 同期方式を確認（pollingまたはbothの場合のみ実行）
    const settings = await getTwoWaySyncSettings()
    if (settings.syncMethod === CalendarSyncMethod.webhook) {
      return NextResponse.json({
        success: true,
        message: 'Polling is disabled (webhook only)',
        skipped: true,
      })
    }

    // Webhook自動更新チェック（有効期限2日前に更新）
    let webhookRenewed = false
    try {
      const renewalResult = await renewWebhookIfNeeded()
      if (renewalResult.renewed) {
        webhookRenewed = true
        // 成功メール通知（バックグラウンド）
        fireAndForget(
          sendWebhookRenewalNotification({
            success: true,
            newExpiration: renewalResult.newExpiration,
          }),
          {
            operation: 'sendWebhookRenewalNotificationSuccess',
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.LOW,
          }
        )
      } else if (!renewalResult.success) {
        // 更新失敗時のメール通知
        logError(new Error(renewalResult.error || 'Webhook renewal failed'), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: { operation: 'renewWebhookIfNeeded' },
        })
        fireAndForget(
          sendWebhookRenewalNotification({
            success: false,
            error: renewalResult.error,
          }),
          {
            operation: 'sendWebhookRenewalNotificationFailure',
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.LOW,
          }
        )
      }
    } catch (renewalError) {
      // Webhook更新エラーはログ記録のみ（同期処理は継続）
      logError(normalizeError(renewalError), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: 'renewWebhookIfNeeded', phase: 'catch' },
      })
      fireAndForget(
        sendWebhookRenewalNotification({
          success: false,
          error:
            renewalError instanceof Error ? renewalError.message : 'Unknown error',
        }),
        {
          operation: 'sendWebhookRenewalNotificationError',
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.LOW,
        }
      )
    }

    // 同期実行
    const result = await syncFromCalendar()

    if (!result.success) {
      logError(new Error('Calendar sync failed'), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: 'syncFromCalendar', errors: result.errors },
      })
      return NextResponse.json(
        {
          success: false,
          errors: result.errors,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      processed: result.processed,
      deleted: result.deleted,
      updated: result.updated,
      errors: result.errors,
      webhookRenewed,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: 'calendarSyncCron' },
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
