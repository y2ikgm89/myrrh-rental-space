/**
 * イベント→カレンダー（単方向同期）
 *
 * イベント作成・更新・キャンセル時にGoogle Calendarと同期するサービス。
 * サービスアカウント経由でスケジュール管理カレンダーに連携します。
 *
 * @module shared/lib/calendar-sync/event-outbound
 */

import "server-only";

import type { calendar_v3 } from "googleapis";
import {
  normalizeError,
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
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
  writeBackMeetingUrl,
} from "@/shared/domain/events/calendar-sync";
import { omitUndefined } from "@/shared/lib/serialize";
import { MEETING_PROVIDER } from "@/shared/lib/validations/enums/prisma-types";
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

/**
 * `createCalendarEvent` の生レスポンスから Meet URL を抽出する。
 *
 * `hangoutLink`（deprecated だが依然として最も確実に埋まるフィールド）を優先し、
 * 無ければ `conferenceData.entryPoints` から video entry point の `uri` を探す。
 * どちらも無ければ null（Meet 発行が API 側で完了していない状態）。
 */
function extractMeetingUrl(
  event: calendar_v3.Schema$Event | undefined,
): string | null {
  return (
    event?.hangoutLink ??
    event?.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === "video",
    )?.uri ??
    null
  );
}

// =============================================================================
// Sync Operations
// =============================================================================

/**
 * イベント作成時のカレンダー同期
 *
 * バックグラウンドで実行され、失敗してもイベント自体は成功とする。
 *
 * `data.meetingProvider === "GOOGLE_MEET"` のときのみ `createCalendarEvent` に
 * `withMeet: true` を渡し、応答から Meet URL を抽出して `Event.meetingUrl` に
 * write-back する（Phase B.1 task 8）。
 */
export async function syncEventToCalendar(
  data: EventSyncData,
): Promise<SyncResult> {
  try {
    const isEnabled = await isGoogleCalendarEnabled();
    if (!isEnabled) {
      return { success: true }; // 無効の場合は何もしない
    }

    const withMeet = data.meetingProvider === MEETING_PROVIDER.GOOGLE_MEET;
    const eventParams = formatEventCalendarEvent(data);
    const result = await createCalendarEvent(eventParams, { withMeet });

    if (result.success && result.eventId) {
      await saveEventGoogleCalendarEventId({
        slotId: data.slotId,
        googleCalendarEventId: result.eventId,
      });

      // Meet URL 抽出・write-back を独立した try/catch で包む。
      // write-back が失敗してもGCal イベント作成とgoogleCalendarEventId 保存は済んでいるため、
      // 外側の sync は成功を返す。write-back エラーはサイレント化（logError で記録）。
      if (withMeet) {
        try {
          const meetingUrl = extractMeetingUrl(result.event);
          if (meetingUrl) {
            await writeBackMeetingUrl({ eventId: data.eventId, meetingUrl });
          }
        } catch (error) {
          // write-back エラーを記録するが、propagate しない
          const message =
            error instanceof Error
              ? error.message
              : normalizeError(error).message;
          logError(new Error(`Failed to write back meeting URL: ${message}`), {
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.MEDIUM,
            context: {
              operation: "writeBackMeetingUrl",
              eventId: data.eventId,
              googleCalendarEventId: result.eventId,
            },
          });
          // Note: この時点で meetingUrl は null のまま。follow-up で別タスク化予定
        }
      }

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
      await clearEventGoogleCalendarEventId({
        googleCalendarEventId: gcalEventId,
      });

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
