/**
 * カレンダー同期サービス
 *
 * 予約作成・更新・キャンセル時にGoogle Calendarと同期
 * - サービスアカウント: 共有カレンダーへの登録
 * - OAuth: 管理者個人カレンダーへの登録（オプション）
 */

import { prisma } from './prisma'
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  createOAuthCalendarEvent,
  isGoogleCalendarEnabled,
  type CalendarEventParams,
} from './google-calendar'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

// =============================================================================
// Types
// =============================================================================

export interface ReservationSyncData {
  reservationId: string
  spaceName: string
  customerName: string
  customerEmail: string
  startTime: Date
  endTime: Date
  location?: string
  notes?: string
  totalPrice?: number | null
}

export interface SyncResult {
  success: boolean
  eventId?: string
  oauthEventId?: string
  error?: string
}

// =============================================================================
// Calendar Event Formatting
// =============================================================================

/**
 * 予約情報からカレンダーイベントパラメータを生成
 */
function formatCalendarEvent(data: ReservationSyncData): CalendarEventParams {
  const formattedDate = format(data.startTime, 'yyyy年M月d日 (EEEE)', { locale: ja })
  const formattedStart = format(data.startTime, 'HH:mm')
  const formattedEnd = format(data.endTime, 'HH:mm')

  const descriptionLines = [
    `予約ID: ${data.reservationId.slice(0, 8).toUpperCase()}`,
    `お客様: ${data.customerName}`,
    `メール: ${data.customerEmail}`,
    `日時: ${formattedDate} ${formattedStart} - ${formattedEnd}`,
  ]

  if (data.totalPrice !== undefined && data.totalPrice !== null) {
    descriptionLines.push(
      `料金: ${new Intl.NumberFormat('ja-JP', {
        style: 'currency',
        currency: 'JPY',
      }).format(data.totalPrice)}`
    )
  }

  if (data.notes) {
    descriptionLines.push(`備考: ${data.notes}`)
  }

  return {
    summary: `【予約】${data.spaceName} - ${data.customerName}様`,
    description: descriptionLines.join('\n'),
    location: data.location,
    startTime: data.startTime,
    endTime: data.endTime,
    attendeeEmail: data.customerEmail,
  }
}

// =============================================================================
// Sync Operations
// =============================================================================

/**
 * 予約作成時のカレンダー同期
 *
 * バックグラウンドで実行され、失敗しても予約自体は成功とする
 */
export async function syncReservationToCalendar(
  data: ReservationSyncData
): Promise<SyncResult> {
  try {
    // Google Calendarが有効か確認
    const isEnabled = await isGoogleCalendarEnabled()
    if (!isEnabled) {
      return { success: true } // 無効の場合は何もしない
    }

    const eventParams = formatCalendarEvent(data)
    const result = await createCalendarEvent(eventParams)

    if (result.success && result.eventId) {
      // 予約レコードにイベントIDを保存
      await prisma.reservation.update({
        where: { id: data.reservationId },
        data: {
          googleCalendarEventId: result.eventId,
          calendarSyncedAt: new Date(),
          calendarSyncError: null,
        },
      })

      return {
        success: true,
        eventId: result.eventId,
      }
    }

    // エラーを記録
    await prisma.reservation.update({
      where: { id: data.reservationId },
      data: {
        calendarSyncError: result.error || 'Unknown error',
      },
    })

    console.error('Failed to sync reservation to calendar:', result.error)
    return { success: false, error: result.error }
  } catch (error) {
    console.error('Calendar sync error:', error)

    // エラーを記録
    await prisma.reservation
      .update({
        where: { id: data.reservationId },
        data: {
          calendarSyncError:
            error instanceof Error ? error.message : 'Unknown error',
        },
      })
      .catch((updateError) => {
        console.error('Failed to save calendar sync error:', updateError)
      })

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * 予約更新時のカレンダー同期
 */
export async function updateCalendarSync(
  data: ReservationSyncData,
  existingEventId: string
): Promise<SyncResult> {
  try {
    const isEnabled = await isGoogleCalendarEnabled()
    if (!isEnabled) {
      return { success: true }
    }

    const eventParams = formatCalendarEvent(data)
    const result = await updateCalendarEvent(existingEventId, eventParams)

    if (result.success) {
      await prisma.reservation.update({
        where: { id: data.reservationId },
        data: {
          calendarSyncedAt: new Date(),
          calendarSyncError: null,
        },
      })

      return { success: true, eventId: existingEventId }
    }

    // エラーを記録
    await prisma.reservation.update({
      where: { id: data.reservationId },
      data: {
        calendarSyncError: result.error || 'Update failed',
      },
    })

    return { success: false, error: result.error }
  } catch (error) {
    console.error('Calendar update sync error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * 予約キャンセル時のカレンダーイベント削除
 */
export async function deleteCalendarSync(
  reservationId: string,
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const isEnabled = await isGoogleCalendarEnabled()
    if (!isEnabled) {
      return { success: true }
    }

    const result = await deleteCalendarEvent(eventId)

    if (result.success) {
      // イベントIDをクリア
      await prisma.reservation.update({
        where: { id: reservationId },
        data: {
          googleCalendarEventId: null,
          calendarSyncError: null,
        },
      })

      return { success: true }
    }

    return { success: false, error: result.error }
  } catch (error) {
    console.error('Calendar delete sync error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * 管理者の個人カレンダーにも同期（OAuth連携時）
 */
export async function syncToAdminCalendar(
  adminUserId: string,
  data: ReservationSyncData
): Promise<SyncResult> {
  try {
    const eventParams = formatCalendarEvent(data)
    const result = await createOAuthCalendarEvent(adminUserId, eventParams)

    if (result.success && result.eventId) {
      // OAuthイベントIDを保存
      await prisma.reservation.update({
        where: { id: data.reservationId },
        data: {
          googleCalendarOAuthEventId: result.eventId,
        },
      })

      return { success: true, oauthEventId: result.eventId }
    }

    return { success: false, error: result.error }
  } catch (error) {
    console.error('Admin calendar sync error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// =============================================================================
// Batch Operations (将来のPhase 2用)
// =============================================================================

/**
 * 未同期の予約を一括同期（将来のリトライ機能用）
 */
export async function retryFailedSyncs(): Promise<{
  total: number
  succeeded: number
  failed: number
}> {
  const failedReservations = await prisma.reservation.findMany({
    where: {
      googleCalendarEventId: null,
      calendarSyncError: { not: null },
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
    include: {
      space: true,
      customer: true,
    },
    take: 50, // 一度に処理する最大数
  })

  let succeeded = 0
  let failed = 0

  for (const reservation of failedReservations) {
    const customerName = `${reservation.customer.lastName} ${reservation.customer.firstName}`
    const result = await syncReservationToCalendar({
      reservationId: reservation.id,
      spaceName: reservation.space.name,
      customerName,
      customerEmail: reservation.customer.email,
      startTime: reservation.startTime,
      endTime: reservation.endTime,
      location: reservation.space.address ?? undefined,
      notes: reservation.notes ?? undefined,
      totalPrice: reservation.totalPrice ? Number(reservation.totalPrice) : null,
    })

    if (result.success) {
      succeeded++
    } else {
      failed++
    }
  }

  return {
    total: failedReservations.length,
    succeeded,
    failed,
  }
}
