import { connection } from 'next/server'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { syncFromCalendar } from '@/lib/calendar-sync'
import {
  isTwoWaySyncEnabled,
  getTwoWaySyncSettings,
  renewWebhookIfNeeded,
} from '@/lib/google-calendar'
import { sendWebhookRenewalNotification } from '@/lib/email-service'

/**
 * カレンダー同期用Cronエンドポイント
 * GET /api/cron/calendar-sync
 *
 * Vercel Cronまたは外部スケジューラーから呼び出される
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
    const cronSecret = process.env.CRON_SECRET

    // 本番環境ではCRON_SECRETを必須とする
    if (!cronSecret && process.env.NODE_ENV === 'production') {
      console.error('CRON_SECRET is not set in production environment')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
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
    if (settings.syncMethod === 'webhook') {
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
        console.log(
          'Webhook renewed successfully. New expiration:',
          renewalResult.newExpiration
        )
        // 成功メール通知（非同期）
        sendWebhookRenewalNotification({
          success: true,
          newExpiration: renewalResult.newExpiration,
        }).catch((err) => {
          console.error('Failed to send webhook renewal notification:', err)
        })
      } else if (!renewalResult.success) {
        // 更新失敗時のメール通知
        console.error('Webhook renewal failed:', renewalResult.error)
        sendWebhookRenewalNotification({
          success: false,
          error: renewalResult.error,
        }).catch((err) => {
          console.error('Failed to send webhook renewal notification:', err)
        })
      }
    } catch (renewalError) {
      // Webhook更新エラーはログ記録のみ（同期処理は継続）
      console.error('Webhook renewal error:', renewalError)
      sendWebhookRenewalNotification({
        success: false,
        error:
          renewalError instanceof Error ? renewalError.message : 'Unknown error',
      }).catch((err) => {
        console.error('Failed to send webhook renewal notification:', err)
      })
    }

    // 同期実行
    const result = await syncFromCalendar()

    if (!result.success) {
      console.error('Calendar sync failed:', result.errors)
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
    console.error('Calendar sync cron error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
