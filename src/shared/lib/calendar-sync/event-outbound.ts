/**
 * イベント→カレンダー（単方向同期）
 *
 * イベント作成・更新・キャンセル時にGoogle Calendarと同期するサービス。
 * サービスアカウント経由でスケジュール管理カレンダーに連携します。
 *
 * @module shared/lib/calendar-sync/event-outbound
 */

import "server-only";

import { normalizeError } from "@/shared/lib/errors/server";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  isGoogleCalendarEnabled,
  type CalendarEventParams,
} from "@/shared/lib/google-calendar";
import {
  clearEventGoogleCalendarEventId,
  markEventCalendarSyncError,
  saveEventGoogleCalendarEventId,
} from "@/shared/domain/events/calendar-sync";
import { omitUndefined } from "@/shared/lib/serialize";
import { OUTBOUND_EVENT_MARKER } from "./loop-prevention";
import type { EventSyncData, SyncResult } from "./types";

// =============================================================================
// Calendar Event Formatting
// =============================================================================

/**
 * イベント情報からカレンダーイベントパラメータを生成
 *
 * description 1行目の「イベントID: ${eventId}」は inbound 同期ループ防止キー。
 * inbound ハンドラはこの行の存在でアウトバウンド書き込みを識別する。
 */
function formatEventCalendarEvent(data: EventSyncData): CalendarEventParams {
  const descriptionLines = [
    // inbound ループ防止マーカー（loop-prevention.ts の SSoT を使用）
    `${OUTBOUND_EVENT_MARKER} ${data.eventId}`,
    `公開ページ: ${data.publicUrl}`,
    "",
    data.descriptionPlainText,
  ];

  return omitUndefined({
    summary: data.title,
    description: descriptionLines.join("\n"),
    location: data.location ?? undefined,
    startTime: data.startTime,
    endTime: data.endTime,
    // attendeeEmail は未設定（attendees 無し方針）
  });
}

// =============================================================================
// Sync Operations
// =============================================================================

/**
 * イベント作成時のカレンダー同期
 *
 * バックグラウンドで実行され、失敗してもイベント自体は成功とする
 */
export async function syncEventToCalendar(
  data: EventSyncData,
): Promise<SyncResult> {
  try {
    const isEnabled = await isGoogleCalendarEnabled();
    if (!isEnabled) {
      return { success: true }; // 無効の場合は何もしない
    }

    const eventParams = formatEventCalendarEvent(data);
    const result = await createCalendarEvent(eventParams);

    if (result.success && result.eventId) {
      await saveEventGoogleCalendarEventId({
        eventId: data.eventId,
        googleCalendarEventId: result.eventId,
      });

      return {
        success: true,
        eventId: result.eventId,
      };
    }

    // エラーを記録（markEventCalendarSyncError が logError を呼ぶため重複呼び出し禁止）
    await markEventCalendarSyncError({
      eventId: data.eventId,
      error: result.error ?? "Unknown error",
    });

    return omitUndefined({ success: false, error: result.error });
  } catch (error) {
    // markEventCalendarSyncError が内部で logError を呼ぶため重複呼び出し禁止
    const message =
      error instanceof Error ? error.message : normalizeError(error).message;
    await markEventCalendarSyncError({
      eventId: data.eventId,
      error: message,
    });
    return { success: false, error: message };
  }
}

/**
 * イベント更新時のカレンダー同期
 */
export async function updateEventCalendarSync(
  data: EventSyncData,
  existingEventId: string,
): Promise<SyncResult> {
  try {
    const isEnabled = await isGoogleCalendarEnabled();
    if (!isEnabled) {
      return { success: true };
    }

    const eventParams = formatEventCalendarEvent(data);
    const result = await updateCalendarEvent(existingEventId, eventParams);

    if (result.success) {
      return { success: true, eventId: existingEventId };
    }

    await markEventCalendarSyncError({
      eventId: data.eventId,
      error: result.error ?? "Update failed",
    });

    return omitUndefined({ success: false, error: result.error });
  } catch (error) {
    // markEventCalendarSyncError が内部で logError を呼ぶため重複呼び出し禁止
    const message =
      error instanceof Error ? error.message : normalizeError(error).message;
    await markEventCalendarSyncError({
      eventId: data.eventId,
      error: message,
    });
    return { success: false, error: message };
  }
}

/**
 * イベントキャンセル時のカレンダーイベント削除
 */
export async function deleteEventCalendarSync(
  eventId: string,
  gcalEventId: string,
): Promise<SyncResult> {
  try {
    const isEnabled = await isGoogleCalendarEnabled();
    if (!isEnabled) {
      return { success: true };
    }

    const result = await deleteCalendarEvent(gcalEventId);

    if (result.success) {
      await clearEventGoogleCalendarEventId(eventId);

      return { success: true };
    }

    return omitUndefined({ success: false, error: result.error });
  } catch (error) {
    // markEventCalendarSyncError が内部で logError を呼ぶため重複呼び出し禁止
    const message =
      error instanceof Error ? error.message : normalizeError(error).message;
    await markEventCalendarSyncError({
      eventId,
      error: message,
    });
    return { success: false, error: message };
  }
}
