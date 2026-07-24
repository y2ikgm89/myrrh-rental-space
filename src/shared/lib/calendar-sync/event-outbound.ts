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
  deleteCalendarEvent,
  updateCalendarEvent,
  isGoogleCalendarEnabled,
  isGoogleCalendarConfigured,
  type CalendarEventParams,
} from "@/shared/lib/google-calendar";
import {
  clearEventGoogleCalendarEventId,
  getEventSlotsForCalendarSync,
  getFailedCalendarSyncEventIds,
  markEventCalendarSyncError,
  markEventCalendarSyncSuccess,
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
      try {
        await saveEventGoogleCalendarEventId({
          slotId: data.slotId,
          googleCalendarEventId: result.eventId,
        });
      } catch (dbError) {
        // GCAL-AUDIT-07: event 側も reservation 側と同型の compensating action。
        // GCal 側の作成は成功したが DB write-back が失敗した場合、次回 retry の
        // createCalendarEvent 再実行による GCal 重複イベントを防ぐため、作成済み
        // GCal event を削除してから失敗を記録する。
        const compensationResult = await deleteCalendarEvent(result.eventId);
        if (!compensationResult.success) {
          logError(
            new Error(
              `Compensating delete failed after DB write-back error: ${compensationResult.error}`,
            ),
            {
              category: ErrorCategory.EXTERNAL_API,
              severity: ErrorSeverity.HIGH,
              context: {
                operation: "syncEventToCalendar.compensate",
                eventId: data.eventId,
                googleCalendarEventId: result.eventId,
              },
            },
          );
        }
        const message =
          dbError instanceof Error
            ? dbError.message
            : normalizeError(dbError).message;
        await markEventCalendarSyncError({
          eventId: data.eventId,
          error: message,
        });
        return { success: false, error: message };
      }

      // Meet URL 抽出・write-back を独立した try/catch で包む。
      // write-back が失敗してもGCal イベント作成とgoogleCalendarEventId 保存は済んでいるため、
      // 外側の sync は成功を返す。GCAL-AUDIT-04 / GCAL-OUTBOUND-06: ただし silent
      // 成功にはせず `Event.calendarSyncError` に記録し admin dashboard から
      // 追跡可能にする（write-back 失敗だけでなく、GCal API 応答に Meet URL が
      // 含まれていなかったケースも同様に記録する — 旧実装はこちらを完全に黙殺していた）。
      if (withMeet) {
        try {
          const meetingUrl = extractMeetingUrl(result.event);
          if (meetingUrl) {
            await writeBackMeetingUrl({ eventId: data.eventId, meetingUrl });
          } else {
            await markEventCalendarSyncError({
              eventId: data.eventId,
              error:
                "Meet URL was not returned by the Google Calendar API response",
            });
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : normalizeError(error).message;
          await markEventCalendarSyncError({
            eventId: data.eventId,
            error: `Meet URL write-back failed: ${message}`,
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
 *
 * GCAL-OUTBOUND-05: reservation 側の `deleteCalendarSync` と同じ設計。
 * `isGoogleCalendarEnabled()` (トグル) ではなく `isGoogleCalendarConfigured()`
 * (サービスアカウント + カレンダー ID の設定有無) を gate にし、トグル OFF でも
 * 既存 GCal event の削除は実行できるようにする。
 */
export async function deleteEventCalendarSync(
  eventId: string,
  gcalEventId: string,
): Promise<SyncResult> {
  try {
    const isConfigured = await isGoogleCalendarConfigured();
    if (!isConfigured) {
      return { success: true };
    }

    const result = await deleteCalendarEvent(gcalEventId, {
      ignoreEnabledToggle: true,
    });

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

// =============================================================================
// Batch Operations (GCAL-AUDIT-04)
// =============================================================================

/**
 * `Event.calendarSyncError` が残っているイベントのうち、`googleCalendarEventId`
 * が未設定のスロットを対象に create を再試行する。
 *
 * update / delete 失敗（slot は既に `googleCalendarEventId` を持つ）はここでは
 * 拾わない — event 単位の再送で slot 側 GCal event を都度作り直すと孤児 event を
 * 生むため対象外（reservation 側の update/delete retry と非対称、GCAL-AUDIT-04 の
 * スコープは「failed slots with null googleCalendarEventId + event.calendarSyncError」）。
 * 全 slot が同期済みになったら event 側の `calendarSyncError` を解消する。
 */
export async function retryFailedEventCalendarSyncs(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
}> {
  const eventIds = await getFailedCalendarSyncEventIds();

  let total = 0;
  let succeeded = 0;
  let failed = 0;

  for (const eventId of eventIds) {
    const slots = await getEventSlotsForCalendarSync(eventId);
    const pendingSlots = slots.filter(
      (slot) => slot.googleCalendarEventId === null,
    );

    for (const slot of pendingSlots) {
      total++;
      const result = await syncEventToCalendar(slot);
      if (result.success) {
        succeeded++;
      } else {
        failed++;
      }
    }

    if (pendingSlots.length === 0) {
      // 対象 slot が無い（Meet URL write-back 失敗等、機械的な再試行では解消しない
      // event-level エラー）は自動 retry 対象外。calendarSyncError を残したまま
      // admin dashboard 側の可視化に委ねる（silent clear しない — GCAL-AUDIT-04）。
      continue;
    }

    const refreshed = await getEventSlotsForCalendarSync(eventId);
    if (refreshed.every((slot) => slot.googleCalendarEventId !== null)) {
      await markEventCalendarSyncSuccess(eventId);
    }
  }

  return { total, succeeded, failed };
}
