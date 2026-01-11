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
  isTwoWaySyncEnabled,
  fetchCalendarChanges,
  type CalendarEventParams,
  type CalendarChange,
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
// Batch Operations
// =============================================================================

/**
 * 未同期の予約を一括同期（リトライ機能）
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

// =============================================================================
// Two-Way Sync (Phase 4)
// =============================================================================

export interface TwoWaySyncResult {
  success: boolean
  processed: number
  deleted: number
  updated: number
  errors: string[]
}

// 同期中フラグ（メモリ内ロック）
let isSyncing = false

/**
 * カレンダーからの変更を予約システムに同期
 *
 * ポーリングまたはWebhook受信時に呼び出される
 * 競合防止のため、同時に1つの同期のみ実行
 */
export async function syncFromCalendar(): Promise<TwoWaySyncResult> {
  const result: TwoWaySyncResult = {
    success: true,
    processed: 0,
    deleted: 0,
    updated: 0,
    errors: [],
  }

  // 既に同期中の場合はスキップ（競合防止）
  if (isSyncing) {
    console.log('Sync already in progress, skipping')
    return { ...result, success: true }
  }

  isSyncing = true

  try {
    // 双方向同期が有効か確認
    const enabled = await isTwoWaySyncEnabled()
    if (!enabled) {
      isSyncing = false
      return { ...result, success: true }
    }

    // 現在の同期トークンを取得
    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
      select: { googleCalendarSyncToken: true },
    })

    // カレンダーの変更を取得
    const changesResult = await fetchCalendarChanges(settings?.googleCalendarSyncToken)
    if (!changesResult.success) {
      return {
        ...result,
        success: false,
        errors: [changesResult.error || 'Failed to fetch changes'],
      }
    }

    // 変更を処理
    for (const change of changesResult.changes) {
      try {
        const processResult = await processCalendarChange(change)
        result.processed++
        if (processResult.action === 'deleted') {
          result.deleted++
        } else if (processResult.action === 'updated') {
          result.updated++
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        result.errors.push(`Event ${change.eventId}: ${errorMessage}`)
      }
    }

    // 同期トークンを保存
    if (changesResult.newSyncToken) {
      await prisma.settings.update({
        where: { id: 'singleton' },
        data: {
          googleCalendarSyncToken: changesResult.newSyncToken,
          googleCalendarLastSyncedAt: new Date(),
        },
      })
    }

    result.success = result.errors.length === 0

    return result
  } catch (error) {
    console.error('Two-way sync error:', error)
    return {
      ...result,
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    }
  } finally {
    isSyncing = false
  }
}

interface ProcessResult {
  action: 'deleted' | 'updated' | 'skipped' | 'not_found'
  reservationId?: string
}

/**
 * 個々のカレンダー変更を処理
 */
async function processCalendarChange(change: CalendarChange): Promise<ProcessResult> {
  // イベントIDから予約を検索
  const reservation = await prisma.reservation.findFirst({
    where: {
      googleCalendarEventId: change.eventId,
    },
    select: {
      id: true,
      status: true,
      startTime: true,
      endTime: true,
      calendarSyncedAt: true,
    },
  })

  if (!reservation) {
    // 予約が見つからない場合はスキップ
    return { action: 'not_found' }
  }

  // カレンダーで削除された場合
  if (change.deleted) {
    // 予約をキャンセル状態に更新
    if (reservation.status !== 'CANCELLED') {
      // 現在のnotesを取得してから更新
      const currentReservation = await prisma.reservation.findUnique({
        where: { id: reservation.id },
        select: { notes: true },
      })

      const syncNote = `[Google Calendarで削除] ${new Date().toLocaleString('ja-JP')}`
      const newNotes = currentReservation?.notes
        ? `${currentReservation.notes}\n${syncNote}`
        : syncNote

      await prisma.reservation.update({
        where: { id: reservation.id },
        data: {
          status: 'CANCELLED',
          googleCalendarEventId: null,
          calendarSyncedAt: new Date(),
          notes: newNotes,
        },
      })

      return { action: 'deleted', reservationId: reservation.id }
    }
    return { action: 'skipped', reservationId: reservation.id }
  }

  // 時間変更の検出
  if (change.startTime && change.endTime) {
    const startChanged = change.startTime.getTime() !== reservation.startTime.getTime()
    const endChanged = change.endTime.getTime() !== reservation.endTime.getTime()

    if (startChanged || endChanged) {
      // 時間が変更された場合は予約を更新
      await prisma.reservation.update({
        where: { id: reservation.id },
        data: {
          startTime: change.startTime,
          endTime: change.endTime,
          calendarSyncedAt: new Date(),
        },
      })

      return { action: 'updated', reservationId: reservation.id }
    }
  }

  return { action: 'skipped', reservationId: reservation.id }
}

/**
 * 同期ステータスを取得
 */
export async function getSyncStatus(): Promise<{
  enabled: boolean
  lastSyncedAt: Date | null
  syncMethod: string
  webhookActive: boolean
  webhookExpiration: Date | null
}> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      googleCalendarTwoWaySyncEnabled: true,
      googleCalendarSyncMethod: true,
      googleCalendarLastSyncedAt: true,
      googleCalendarWebhookChannelId: true,
      googleCalendarWebhookExpiration: true,
    },
  })

  return {
    enabled: settings?.googleCalendarTwoWaySyncEnabled ?? false,
    lastSyncedAt: settings?.googleCalendarLastSyncedAt ?? null,
    syncMethod: settings?.googleCalendarSyncMethod ?? 'polling',
    webhookActive: !!settings?.googleCalendarWebhookChannelId,
    webhookExpiration: settings?.googleCalendarWebhookExpiration ?? null,
  }
}
