/**
 * iCalフィード配信API
 *
 * 外部カレンダーアプリ（TimeTree, Google Calendar等）から購読可能な
 * iCalフィード（.ics）を配信します。
 *
 * ## 機能
 * - トークンベースの認証
 * - 予約データのiCal形式変換
 * - スペース別フィルタリング
 *
 * @module api/ical/[token]
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/shared/lib/prisma'
import { generateICalFeed, type CalendarEvent } from '@/shared/lib/ical'
import { format } from 'date-fns'
import { ACTIVE_RESERVATION_STATUSES } from '@/shared/lib/validations/enums'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors/server'
import { fireAndForget } from '@/shared/lib/async-utils'

/**
 * iCalフィード配信エンドポイント
 * GET /api/ical/{token}
 *
 * 外部カレンダーアプリ（TimeTree, Google Calendar等）から購読可能なiCalフィードを返す
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    // 設定確認（先に実行して不要なDB負荷を避ける）
    const settings = await prisma.settings.findFirst()
    if (!settings?.icalFeedEnabled) {
      return new NextResponse('iCal feed is disabled', { status: 403 })
    }

    // トークン検証
    const icalToken = await prisma.iCalToken.findUnique({
      where: { token },
      include: {
        space: { select: { name: true } },
      },
    })

    if (!icalToken) {
      return new NextResponse('Invalid token', { status: 404 })
    }

    // 有効期限チェック
    if (icalToken.expiresAt && icalToken.expiresAt < new Date()) {
      return new NextResponse('Token expired', { status: 410 })
    }

    // 最終アクセス日時を更新（バックグラウンド）
    fireAndForget(
      prisma.iCalToken.update({
        where: { id: icalToken.id },
        data: { lastUsedAt: new Date() },
      }),
      {
        operation: 'updateICalTokenLastUsed',
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
      }
    )

    // 予約データ取得（直近3ヶ月 + 過去1ヶ月の範囲と重複するもの）
    const now = new Date()
    const rangeStart = new Date(now)
    rangeStart.setMonth(rangeStart.getMonth() - 1)
    const rangeEnd = new Date(now)
    rangeEnd.setMonth(rangeEnd.getMonth() + 3)

    // 範囲と重複する予約を取得（startTime < rangeEnd AND endTime > rangeStart）
    const reservations = await prisma.reservation.findMany({
      where: {
        status: { in: [...ACTIVE_RESERVATION_STATUSES] },
        startTime: { lt: rangeEnd },
        endTime: { gt: rangeStart },
        ...(icalToken.spaceId && { spaceId: icalToken.spaceId }),
      },
      include: {
        space: { select: { name: true, address: true } },
        customer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { startTime: 'asc' },
      take: 500, // 最大500件
    })

    // カレンダーイベントに変換
    const events: (CalendarEvent & { uid: string })[] = reservations.map((r) => {
      const formattedDate = format(r.startTime, 'yyyy/MM/dd')
      const formattedStart = format(r.startTime, 'HH:mm')
      const formattedEnd = format(r.endTime, 'HH:mm')

      // 顧客情報の表示（設定に応じて）
      const customerInfo = settings.icalFeedIncludeCustomerInfo
        ? `${r.customer.lastName} ${r.customer.firstName}様`
        : '予約済み'

      const description = [
        `予約ID: ${r.id.slice(0, 8).toUpperCase()}`,
        `日時: ${formattedDate} ${formattedStart} - ${formattedEnd}`,
        settings.icalFeedIncludeCustomerInfo ? `お客様: ${customerInfo}` : null,
      ]
        .filter(Boolean)
        .join('\n')

      return {
        uid: `reservation-${r.id}@myrrh-rental-space`,
        title: `【予約】${r.space.name}${settings.icalFeedIncludeCustomerInfo ? ` - ${customerInfo}` : ''}`,
        description,
        location: r.space.address ?? undefined,
        startTime: r.startTime,
        endTime: r.endTime,
      }
    })

    // カレンダー名
    const calendarName = icalToken.space
      ? `${icalToken.space.name} - 予約カレンダー`
      : '予約カレンダー'

    // iCalフィード生成
    const icalContent = generateICalFeed(events, calendarName)

    // レスポンス
    return new NextResponse(icalContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `inline; filename="${icalToken.name || 'calendar'}.ics"`,
        'Cache-Control': 'private, max-age=3600', // 1時間キャッシュ
      },
    })
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'iCalFeed' },
    })
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
