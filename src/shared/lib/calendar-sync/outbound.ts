/**
 * 予約→カレンダー（単方向同期）
 *
 * 予約作成・更新・キャンセル時にGoogle Calendarと同期するサービス。
 * サービスアカウントまたはOAuth経由で連携します。
 *
 * @module shared/lib/calendar-sync/outbound
 */

import "server-only";
import { formatCurrency } from "@/shared/lib/pricing/format";
import {
  clearReservationCalendarEvent,
  getCalendarSyncRuntimeState,
  getFailedCalendarSyncReservations,
  markReservationCalendarSyncError,
  markReservationCalendarSyncSuccess,
  markReservationCalendarSyncUpdated,
} from "@/shared/domain/reservations/calendar-sync";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { fireAndForget } from "@/shared/lib/async-utils";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  isGoogleCalendarEnabled,
  type CalendarEventParams,
} from "@/shared/lib/google-calendar";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  formatDateWithWeekday,
  formatTimeShort,
} from "@/shared/lib/date-format";
import { OUTBOUND_RESERVATION_MARKER } from "./loop-prevention";
import type { ReservationSyncData, SyncResult } from "./types";

// =============================================================================
// Calendar Event Formatting
// =============================================================================

/**
 * 予約情報からカレンダーイベントパラメータを生成
 */
function formatCalendarEvent(data: ReservationSyncData): CalendarEventParams {
  const formattedDate = formatDateWithWeekday(data.startTime);
  const formattedStart = formatTimeShort(data.startTime);
  const formattedEnd = formatTimeShort(data.endTime);

  const descriptionLines = [
    // inbound ループ防止マーカー（loop-prevention.ts の SSoT を使用）
    `${OUTBOUND_RESERVATION_MARKER} ${data.reservationId.slice(0, 8).toUpperCase()}`,
    `お客様: ${data.customerName}`,
    `メール: ${data.customerEmail}`,
    `日時: ${formattedDate} ${formattedStart} - ${formattedEnd}`,
  ];

  if (data.totalPrice !== undefined && data.totalPrice !== null) {
    descriptionLines.push(`料金: ${formatCurrency(data.totalPrice)}`);
  }

  if (data.notes) {
    descriptionLines.push(`備考: ${data.notes}`);
  }

  return omitUndefined({
    summary: `【予約】${data.spaceName} - ${data.customerName}様`,
    description: descriptionLines.join("\n"),
    location: data.location,
    startTime: data.startTime,
    endTime: data.endTime,
    attendeeEmail: data.customerEmail,
  });
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
  data: ReservationSyncData,
): Promise<SyncResult> {
  try {
    // Google Calendarが有効か確認
    const isEnabled = await isGoogleCalendarEnabled();
    if (!isEnabled) {
      return { success: true }; // 無効の場合は何もしない
    }

    const eventParams = formatCalendarEvent(data);
    // options を省略 = withMeet: false 固定（業界標準に従い物理 space 予約に Meet URL は
    // 付与しない。Phase B.1 task 8 で確定 — ここに withMeet: true を足さないこと）。
    const result = await createCalendarEvent(eventParams);

    if (result.success && result.eventId) {
      await markReservationCalendarSyncSuccess({
        reservationId: data.reservationId,
        eventId: result.eventId,
      });

      return {
        success: true,
        eventId: result.eventId,
      };
    }

    // エラーを記録
    await markReservationCalendarSyncError({
      reservationId: data.reservationId,
      error: result.error || "Unknown error",
    });

    logError(new Error(result.error || "Unknown error"), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "syncReservationToCalendar",
        reservationId: data.reservationId,
      },
    });
    return omitUndefined({ success: false, error: result.error });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "syncReservationToCalendar",
        reservationId: data.reservationId,
      },
    });

    // エラーを記録（バックグラウンド）
    fireAndForget(
      markReservationCalendarSyncError({
        reservationId: data.reservationId,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        operation: "saveCalendarSyncError",
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
        context: { reservationId: data.reservationId },
      },
    );

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * 予約更新時のカレンダー同期
 */
export async function updateCalendarSync(
  data: ReservationSyncData,
  existingEventId: string,
): Promise<SyncResult> {
  try {
    const isEnabled = await isGoogleCalendarEnabled();
    if (!isEnabled) {
      return { success: true };
    }

    const eventParams = formatCalendarEvent(data);
    const result = await updateCalendarEvent(existingEventId, eventParams);

    if (result.success) {
      await markReservationCalendarSyncUpdated(data.reservationId);

      return { success: true, eventId: existingEventId };
    }

    await markReservationCalendarSyncError({
      reservationId: data.reservationId,
      error: result.error || "Update failed",
    });

    return omitUndefined({ success: false, error: result.error });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "updateCalendarSync",
        reservationId: data.reservationId,
        eventId: existingEventId,
      },
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * 予約キャンセル時のカレンダーイベント削除
 */
export async function deleteCalendarSync(
  reservationId: string,
  eventId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const isEnabled = await isGoogleCalendarEnabled();
    if (!isEnabled) {
      return { success: true };
    }

    const result = await deleteCalendarEvent(eventId);

    if (result.success) {
      await clearReservationCalendarEvent(reservationId);

      return { success: true };
    }

    return { success: false, error: result.error };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "deleteCalendarSync",
        reservationId,
        eventId,
      },
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// =============================================================================
// Batch Operations
// =============================================================================

/**
 * 未同期の予約を一括同期（リトライ機能）
 */
export async function retryFailedSyncs(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
}> {
  const failedReservations = await getFailedCalendarSyncReservations();

  let succeeded = 0;
  let failed = 0;

  for (const reservation of failedReservations) {
    const customerName = `${reservation.customer.lastName} ${reservation.customer.firstName}`;
    const result = await syncReservationToCalendar(
      omitUndefined({
        reservationId: reservation.id,
        spaceName: reservation.space.name,
        customerName,
        customerEmail: reservation.guestEmail ?? reservation.customer.email,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        location: reservation.space.lineAddress,
        notes: reservation.notes ?? undefined,
        totalPrice: reservation.totalPrice,
      }),
    );

    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return {
    total: failedReservations.length,
    succeeded,
    failed,
  };
}

/**
 * 同期ステータスを取得
 */
export async function getSyncStatus(): Promise<{
  enabled: boolean;
  lastSyncedAt: Date | null;
  syncMethod: string;
  webhookActive: boolean;
  webhookExpiration: Date | null;
}> {
  const settings = await getCalendarSyncRuntimeState();

  return {
    enabled: settings.twoWaySyncEnabled,
    lastSyncedAt: settings.lastSyncedAt,
    syncMethod: settings.syncMethod,
    webhookActive: !!settings.webhookChannelId,
    webhookExpiration: settings.webhookExpiration,
  };
}
