import { NextResponse } from 'next/server'
import { prisma } from '@/shared/lib/prisma'
import { syncFromCalendar } from '@/shared/lib/calendar-sync'
import { isTwoWaySyncEnabled, getTwoWaySyncSettings } from '@/shared/lib/google-calendar'

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
      console.warn('Missing required headers for Google Calendar webhook')
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // 登録されているWebhookか確認
    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
      select: {
        googleCalendarWebhookChannelId: true,
        googleCalendarWebhookResourceId: true,
      },
    })

    if (
      settings?.googleCalendarWebhookChannelId !== channelId ||
      settings?.googleCalendarWebhookResourceId !== resourceId
    ) {
      console.warn('Unknown webhook channel/resource:', { channelId, resourceId })
      // 不明なWebhookでも200を返す（Googleが再送しないように）
      return NextResponse.json({ success: true, ignored: true })
    }

    // syncイベントは初回登録時の確認なのでスキップ
    if (resourceState === 'sync') {
      console.log('Google Calendar webhook sync confirmation received')
      return NextResponse.json({ success: true, sync: true })
    }

    // 双方向同期が有効か確認
    const enabled = await isTwoWaySyncEnabled()
    if (!enabled) {
      return NextResponse.json({ success: true, disabled: true })
    }

    // 同期方式を確認（webhookまたはbothの場合のみ実行）
    const syncSettings = await getTwoWaySyncSettings()
    if (syncSettings.syncMethod === 'polling') {
      return NextResponse.json({ success: true, pollingOnly: true })
    }

    // 同期実行
    console.log('Processing Google Calendar webhook notification:', {
      channelId,
      resourceState,
    })

    const result = await syncFromCalendar()

    if (!result.success) {
      console.error('Webhook sync failed:', result.errors)
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
    console.error('Google Calendar webhook error:', error)
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
