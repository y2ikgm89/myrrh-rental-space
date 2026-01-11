import { NextResponse } from 'next/server'
import { syncFromCalendar } from '@/lib/calendar-sync'
import { isTwoWaySyncEnabled, getTwoWaySyncSettings } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * カレンダー同期用Cronエンドポイント
 * GET /api/cron/calendar-sync
 *
 * Vercel Cronまたは外部スケジューラーから呼び出される
 * 設定で指定された間隔（デフォルト5分）でカレンダーの変更をチェック
 *
 * セキュリティ: CRON_SECRET環境変数による認証
 */
export async function GET(request: Request) {
  try {
    // 認証チェック（CRON_SECRETが設定されている場合は必須）
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    // 本番環境ではCRON_SECRETを必須とする
    if (!cronSecret && process.env.NODE_ENV === 'production') {
      console.error('CRON_SECRET is not set in production environment')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
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
