/**
 * カレンダー同期サービス
 *
 * 予約作成・更新・キャンセル時にGoogle Calendarと同期するサービス。
 * サービスアカウントまたはOAuth経由で連携します。
 *
 * ## 同期モード
 * - **サービスアカウント**: 共有カレンダーへの登録（推奨）
 * - **OAuth**: 管理者個人カレンダーへの登録（オプション）
 *
 * ## 双方向同期（Two-Way Sync）
 * - カレンダー側での変更を予約システムに反映
 * - ポーリングまたはWebhookで変更検知
 * - 競合時は既存予約を優先（変更拒否）
 *
 * @module shared/lib/calendar-sync
 */

import { prisma } from '@/shared/lib/prisma'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'
import { fireAndForget } from '@/shared/lib/async-utils'
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  createOAuthCalendarEvent,
  isGoogleCalendarEnabled,
  fetchCalendarChanges,
  type CalendarEventParams,
  type CalendarChange,
} from '@/shared/lib/google-calendar'
import { sendCalendarSyncRejectionEmail } from '@/shared/lib/email-service'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { ACTIVE_RESERVATION_STATUSES } from '@/shared/lib/validations/enums'
import { CalendarSyncMethod } from '@/shared/generated/prisma/enums'

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

    logError(new Error(result.error || 'Unknown error'), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: 'syncReservationToCalendar',
        reservationId: data.reservationId,
      },
    })
    return { success: false, error: result.error }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: 'syncReservationToCalendar',
        reservationId: data.reservationId,
      },
    })

    // エラーを記録（バックグラウンド）
    fireAndForget(
      prisma.reservation.update({
        where: { id: data.reservationId },
        data: {
          calendarSyncError:
            error instanceof Error ? error.message : 'Unknown error',
        },
      }),
      {
        operation: 'saveCalendarSyncError',
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
        context: { reservationId: data.reservationId },
      }
    )

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
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: 'updateCalendarSync',
        reservationId: data.reservationId,
        eventId: existingEventId,
      },
    })
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
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: 'deleteCalendarSync',
        reservationId,
        eventId,
      },
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * 管理者の個人カレンダーにも同期（OAuth連携時）
 *
 * 管理者がOAuthで個人カレンダーを連携している場合、
 * 予約イベントを個人カレンダーにも追加します。
 *
 * @param adminUserId - 管理者ユーザーID
 * @param data - 予約同期データ
 * @returns 同期結果
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
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: 'syncToAdminCalendar',
        adminUserId,
        reservationId: data.reservationId,
      },
    })
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
      status: { in: [...ACTIVE_RESERVATION_STATUSES] },
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      notes: true,
      totalPrice: true,
      space: {
        select: { name: true, address: true },
      },
      customer: {
        select: { firstName: true, lastName: true, email: true },
      },
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
      totalPrice: reservation.totalPrice,
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

// 同期の最小間隔（秒）- 連続呼び出しを防ぐ
const SYNC_MIN_INTERVAL_SECONDS = 10

/**
 * カレンダーからの変更を予約システムに同期
 *
 * ポーリングまたはWebhook受信時に呼び出される
 * 楽観的ロック: 最終同期時刻をチェックして連続実行を防止
 */
export async function syncFromCalendar(): Promise<TwoWaySyncResult> {
  const result: TwoWaySyncResult = {
    success: true,
    processed: 0,
    deleted: 0,
    updated: 0,
    errors: [],
  }

  try {
    // 楽観的ロック: 最近同期された場合はスキップ
    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
      select: {
        googleCalendarLastSyncedAt: true,
        googleCalendarSyncToken: true,
        googleCalendarTwoWaySyncEnabled: true,
      },
    })

    if (settings?.googleCalendarLastSyncedAt) {
      const lastSyncedAt = settings.googleCalendarLastSyncedAt.getTime()
      const now = Date.now()
      if (now - lastSyncedAt < SYNC_MIN_INTERVAL_SECONDS * 1000) {
        return { ...result, success: true }
      }
    }

    // 双方向同期が有効か確認
    if (!settings?.googleCalendarTwoWaySyncEnabled) {
      return { ...result, success: true }
    }

    // 同期開始を記録（楽観的ロック）
    await prisma.settings.update({
      where: { id: 'singleton' },
      data: { googleCalendarLastSyncedAt: new Date() },
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
        },
      })
    }

    result.success = result.errors.length === 0
    return result
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: 'syncFromCalendar' },
    })
    return {
      ...result,
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    }
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
  // イベントIDから予約を検索（spaceId, space, customerも取得）
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
      spaceId: true,
      notes: true,
      space: { select: { name: true } },
      customer: {
        select: {
          lastName: true,
          firstName: true,
          email: true,
        },
      },
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
      const syncNote = `[Google Calendarで削除] ${new Date().toLocaleString('ja-JP')}`
      const newNotes = reservation.notes ? `${reservation.notes}\n${syncNote}` : syncNote

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
      // トランザクションで重複チェックと更新を実行（競合防止）
      const transactionResult = await prisma.$transaction(async (tx) => {
        // 重複チェック（トランザクション内で再度実行）
        const overlappingReservation = await tx.reservation.findFirst({
          where: {
            spaceId: reservation.spaceId,
            status: { in: [...ACTIVE_RESERVATION_STATUSES] },
            id: { not: reservation.id },
            AND: [
              { startTime: { lt: change.endTime } },
              { endTime: { gt: change.startTime } },
            ],
          },
          select: { id: true, startTime: true, endTime: true },
        })

        if (overlappingReservation) {
          // 重複あり - 変更を拒否
          const rejectionNote =
            `[カレンダー同期エラー] ${new Date().toLocaleString('ja-JP')}\n` +
            `時間変更が重複のため拒否されました。\n` +
            `試行時間: ${format(change.startTime!, 'yyyy/MM/dd HH:mm')} - ${format(change.endTime!, 'HH:mm')}\n` +
            `重複予約ID: ${overlappingReservation.id.slice(0, 8).toUpperCase()}`

          const newNotes = reservation.notes
            ? `${reservation.notes}\n\n${rejectionNote}`
            : rejectionNote

          await tx.reservation.update({
            where: { id: reservation.id },
            data: {
              notes: newNotes,
              calendarSyncError: 'Time change rejected: overlapping reservation',
            },
          })

          return {
            success: false,
            overlappingReservation,
          }
        }

        // 重複なし - 時間を更新
        await tx.reservation.update({
          where: { id: reservation.id },
          data: {
            startTime: change.startTime,
            endTime: change.endTime,
            calendarSyncedAt: new Date(),
            calendarSyncError: null,
          },
        })

        return { success: true }
      })

      if (!transactionResult.success && transactionResult.overlappingReservation) {
        logError(new Error('Calendar time change rejected due to overlap'), {
          category: ErrorCategory.VALIDATION,
          severity: ErrorSeverity.LOW,
          context: {
            operation: 'processCalendarChange',
            reservationId: reservation.id,
            attemptedStartTime: change.startTime.toISOString(),
            attemptedEndTime: change.endTime.toISOString(),
            conflictingReservationId: transactionResult.overlappingReservation.id,
          },
        })

        // 管理者にメール通知（非同期、トランザクション外）
        const customerName = `${reservation.customer.lastName} ${reservation.customer.firstName}`
        fireAndForget(
          sendCalendarSyncRejectionEmail({
            reservationId: reservation.id,
            spaceName: reservation.space.name,
            customerName,
            customerEmail: reservation.customer.email,
            attemptedStartTime: change.startTime,
            attemptedEndTime: change.endTime,
            currentStartTime: reservation.startTime,
            currentEndTime: reservation.endTime,
            conflictingReservation: {
              id: transactionResult.overlappingReservation.id,
              startTime: transactionResult.overlappingReservation.startTime,
              endTime: transactionResult.overlappingReservation.endTime,
            },
          }),
          {
            operation: 'sendCalendarSyncRejectionEmail',
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.LOW,
            context: { reservationId: reservation.id },
          }
        )

        return { action: 'skipped', reservationId: reservation.id }
      }

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
    syncMethod: settings?.googleCalendarSyncMethod ?? CalendarSyncMethod.polling,
    webhookActive: !!settings?.googleCalendarWebhookChannelId,
    webhookExpiration: settings?.googleCalendarWebhookExpiration ?? null,
  }
}
