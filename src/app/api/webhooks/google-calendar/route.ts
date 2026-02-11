/**
 * Google Calendar Webhook API
 *
 * Google Calendar APIからのプッシュ通知を受信し、
 * カレンダーの変更をシステムに反映します。
 *
 * ## 機能
 * - プッシュ通知の受信・検証
 * - カレンダー変更の即時同期
 * - チャンネルID/リソースIDの検証
 *
 * @module api/webhooks/google-calendar
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/shared/lib/prisma'
import { syncFromCalendar } from '@/shared/lib/calendar-sync'
import { isTwoWaySyncEnabled, getTwoWaySyncSettings } from '@/shared/lib/google-calendar'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'
import { CalendarSyncMethod } from '@/shared/generated/prisma/enums'

/**
 * Google Calendar Push Notification Webhook
 * POST /api/webhooks/google-calendar
 *
 * Google Calendar APIからのプッシュ通知を受信
 * カレンダーに変更があると通知が送られてくる
 *
 * ヘッダー:
 * - X-Goog-Channel-ID: チャンネルID
 * - X-Goog-Resource-ID: リソースID
 * - X-Goog-Resource-State: sync | exists | not_exists
 * - X-Goog-Message-Number: メッセージ番号
 */
export async function POST(request: Request) {
  try {
    // Google Calendar Push Notificationヘッダーを取得
    const channelId = request.headers.get('x-goog-channel-id')
    const resourceId = request.headers.get('x-goog-resource-id')
    const resourceState = request.headers.get('x-goog-resource-state')

    // チャンネルIDの検証
    if (!channelId || !resourceId) {
      logError(new Error('Missing required headers for Google Calendar webhook'), {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        context: { operation: 'googleCalendarWebhook', hasChannelId: !!channelId, hasResourceId: !!resourceId },
      })
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // 登録されているWebhookか確認
    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
      select: {
        googleCalendarWebhookChannelId: true,
        googleCalendarWebhookResourceId: true,
        googleCalendarWebhookToken: true,
      },
    })

    // トークン検証（x-goog-channel-token）
    const receivedToken = request.headers.get('x-goog-channel-token')
    
    // トークンが設定されていない場合はWebhookを拒否（セキュリティ強化）
    if (!settings?.googleCalendarWebhookToken) {
      logError(new Error('Webhook token not configured'), {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.HIGH,
        context: { operation: 'googleCalendarWebhook' },
      })
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
    }
    
    if (receivedToken !== settings.googleCalendarWebhookToken) {
      logError(new Error('Invalid webhook token'), {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: 'googleCalendarWebhook', hasToken: !!receivedToken },
      })
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
    }

    if (
      settings?.googleCalendarWebhookChannelId !== channelId ||
      settings?.googleCalendarWebhookResourceId !== resourceId
    ) {
      logError(new Error('Unknown webhook channel/resource'), {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        context: { operation: 'googleCalendarWebhook', channelId, resourceId },
      })
      // 不明なWebhookでも200を返す（Googleが再送しないように）
      return NextResponse.json({ success: true, ignored: true })
    }

    // syncイベントは初回登録時の確認なのでスキップ
    if (resourceState === 'sync') {
      return NextResponse.json({ success: true, sync: true })
    }

    // 双方向同期が有効か確認
    const enabled = await isTwoWaySyncEnabled()
    if (!enabled) {
      return NextResponse.json({ success: true, disabled: true })
    }

    // 同期方式を確認（webhookまたはbothの場合のみ実行）
    const syncSettings = await getTwoWaySyncSettings()
    if (syncSettings.syncMethod === CalendarSyncMethod.polling) {
      return NextResponse.json({ success: true, pollingOnly: true })
    }

    // 同期実行
    const result = await syncFromCalendar()

    if (!result.success) {
      logError(new Error('Webhook sync failed'), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: 'googleCalendarWebhook', errors: result.errors },
      })
      // エラーでも200を返す（Googleが再送しないように）
      return NextResponse.json({
        success: false,
        errors: result.errors,
      })
    }

    return NextResponse.json({
      success: true,
      processed: result.processed,
      deleted: result.deleted,
      updated: result.updated,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: 'googleCalendarWebhook' },
    })
    // エラーでも200を返す（Googleが再送しないように）
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

/**
 * Webhook検証用（GETリクエスト）
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Google Calendar webhook endpoint is ready',
    timestamp: new Date().toISOString(),
  })
}
