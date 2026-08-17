/**
 * イベント→カレンダー（単方向同期）orchestration。
 *
 * GCal API 呼び出しは `@/shared/lib/google-calendar`、Event R-W は
 * `calendar-sync` commands。ループ防止マーカーは lib `loop-prevention`。
 *
 * @module shared/domain/events/event-calendar-outbound
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
  clearEventGoogleCalendarEventId,
  GCAL_DELETE_FAILED_PREFIX,
  getEventGoogleCalendarEventIdsForDelete,
  getEventSlotsForCalendarSync,
  getEventCalendarSyncError,
  getFailedCalendarSyncEventIds,
  markEventCalendarSyncError,
  markEventCalendarSyncSuccess,
  saveEventGoogleCalendarEventId,
  writeBackMeetingUrl,
} from "@/shared/domain/events/calendar-sync";
import {
  addMeetConferenceToCalendarEvent,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  updateCalendarEvent,
} from "@/shared/domain/settings/google-calendar-api";
import {
  isGoogleCalendarConfigured,
  isGoogleCalendarEnabled,
} from "@/shared/domain/settings/google-calendar";
import { omitUndefined } from "@/shared/lib/serialize";
import { MEETING_PROVIDER } from "@/shared/lib/validations/enums/prisma-types";
import { OUTBOUND_EVENT_MARKER } from "@/shared/lib/calendar-sync/loop-prevention";
import {
  buildGoogleCalendarEventId,
  type CalendarEventParams,
} from "@/shared/lib/google-calendar";
import type {
  EventSyncData,
  SyncResult,
} from "@/shared/lib/calendar-sync/types";

/** Meet URL write-back のみの失敗 (GCal event は作成済み — update retry では解消しない) */
export const MEET_URL_NOT_RETURNED_ERROR =
  "Meet URL was not returned by the Google Calendar API response";

const MEET_URL_WRITE_BACK_FAILED_PREFIX = "Meet URL write-back failed:";

function isMeetOnlyCalendarSyncError(error: string): boolean {
  return (
    error.startsWith(MEET_URL_WRITE_BACK_FAILED_PREFIX) ||
    error === MEET_URL_NOT_RETURNED_ERROR
  );
}

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
    id: buildGoogleCalendarEventId("eventSlot", data.slotId),
    summary: data.title,
    description: descriptionLines.join("\n"),
    location: data.location ?? undefined,
    startTime: data.startTime,
    endTime: data.endTime,
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
              error: MEET_URL_NOT_RETURNED_ERROR,
            });
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : normalizeError(error).message;
          await markEventCalendarSyncError({
            eventId: data.eventId,
            error: `${MEET_URL_WRITE_BACK_FAILED_PREFIX} ${message}`,
          });
          // Meet URL retry は `retryFailedEventCalendarSyncs` / calendar-sync-retry cron が担う。
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

    await markEventCalendarSyncError({
      eventId,
      error: `${GCAL_DELETE_FAILED_PREFIX}${result.error ?? "Delete failed"}`,
    });

    return omitUndefined({ success: false, error: result.error });
  } catch (error) {
    // markEventCalendarSyncError が内部で logError を呼ぶため重複呼び出し禁止
    const message =
      error instanceof Error ? error.message : normalizeError(error).message;
    await markEventCalendarSyncError({
      eventId,
      error: `${GCAL_DELETE_FAILED_PREFIX}${message}`,
    });
    return { success: false, error: message };
  }
}

// =============================================================================
// Meet URL Write-back Retry
// =============================================================================

/**
 * GCal event から Meet URL を取得し `Event.meetingUrl` に write-back する。
 *
 * 1. `getCalendarEvent` で hangoutLink / conferenceData.entryPoints を確認
 * 2. 無ければ `addMeetConferenceToCalendarEvent` (patch + createRequest) を試行
 * 3. patch 応答に URL が無ければ get で再取得 (conference 生成は非同期)
 *
 * **Residual risk**: サービスアカウントが Meet 発行権限を持たない、または
 * conferenceData.status が `pending` のまま完了しない場合は URL 取得不可。
 * その場合 `calendarSyncError` を残し admin dashboard で可視化を継続する。
 */
export async function retryEventMeetUrlWriteBack(params: {
  eventId: string;
  googleCalendarEventId: string;
  meetingProvider: EventSyncData["meetingProvider"];
}): Promise<{ success: boolean; error?: string }> {
  if (params.meetingProvider !== MEETING_PROVIDER.GOOGLE_MEET) {
    return {
      success: false,
      error: "Meet URL retry applies only to GOOGLE_MEET events",
    };
  }

  const isEnabled = await isGoogleCalendarEnabled();
  if (!isEnabled) {
    return { success: true };
  }

  const fetchResult = await getCalendarEvent(params.googleCalendarEventId);
  if (!fetchResult.success) {
    return {
      success: false,
      error: `Meet URL retry fetch failed: ${fetchResult.error ?? "Unknown error"}`,
    };
  }

  let meetingUrl = extractMeetingUrl(fetchResult.event);
  if (!meetingUrl) {
    const patchResult = await addMeetConferenceToCalendarEvent(
      params.googleCalendarEventId,
    );
    if (!patchResult.success) {
      return {
        success: false,
        error: `Meet URL retry conference patch failed: ${patchResult.error ?? "Unknown error"}`,
      };
    }

    meetingUrl = extractMeetingUrl(patchResult.event);
    if (!meetingUrl) {
      const refetchResult = await getCalendarEvent(
        params.googleCalendarEventId,
      );
      if (refetchResult.success) {
        meetingUrl = extractMeetingUrl(refetchResult.event);
      }
    }
  }

  if (!meetingUrl) {
    return { success: false, error: MEET_URL_NOT_RETURNED_ERROR };
  }

  try {
    await writeBackMeetingUrl({
      eventId: params.eventId,
      meetingUrl,
    });
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : normalizeError(error).message;
    return {
      success: false,
      error: `${MEET_URL_WRITE_BACK_FAILED_PREFIX} ${message}`,
    };
  }
}

// =============================================================================
// Batch Operations (GCAL-AUDIT-04)
// =============================================================================

/**
 * `Event.calendarSyncError` が残っているイベントを再試行する。
 *
 * - slot の `googleCalendarEventId` が null → create (`syncEventToCalendar`)
 * - slot の `googleCalendarEventId` 有り + `GCAL_DELETE_FAILED_PREFIX` エラー
 *   → delete (`deleteEventCalendarSync`)。CANCELLED 等で GCal 上に残っている状態。
 * - slot の `googleCalendarEventId` 有り + Meet write-back のみのエラー → Meet URL retry
 *   (`retryEventMeetUrlWriteBack`: GCal 再取得 / conferenceData patch)
 * - slot の `googleCalendarEventId` 有り + それ以外のエラー → update (`updateEventCalendarSync`)
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
    const syncError = await getEventCalendarSyncError(eventId);
    const gcalIdsForDelete =
      await getEventGoogleCalendarEventIdsForDelete(eventId);
    const isDeleteRetry =
      gcalIdsForDelete.length > 0 &&
      syncError?.startsWith(GCAL_DELETE_FAILED_PREFIX) === true;

    if (isDeleteRetry) {
      for (const gcalEventId of gcalIdsForDelete) {
        total++;
        const result = await deleteEventCalendarSync(eventId, gcalEventId);
        if (result.success) {
          succeeded++;
        } else {
          failed++;
        }
      }

      const remaining = await getEventGoogleCalendarEventIdsForDelete(eventId);
      if (remaining.length === 0) {
        await markEventCalendarSyncSuccess(eventId);
      }
      continue;
    }

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

    if (pendingSlots.length > 0) {
      const refreshed = await getEventSlotsForCalendarSync(eventId);
      if (refreshed.every((slot) => slot.googleCalendarEventId !== null)) {
        await markEventCalendarSyncSuccess(eventId);
      }
      continue;
    }

    const isUpdateRetry =
      syncError !== null &&
      syncError.startsWith(GCAL_DELETE_FAILED_PREFIX) !== true &&
      !isMeetOnlyCalendarSyncError(syncError);

    if (isUpdateRetry) {
      let allUpdateSucceeded = true;
      for (const slot of slots) {
        const gcalEventId = slot.googleCalendarEventId;
        if (gcalEventId === null) continue;

        total++;
        const result = await updateEventCalendarSync(slot, gcalEventId);
        if (result.success) {
          succeeded++;
        } else {
          failed++;
          allUpdateSucceeded = false;
        }
      }

      if (
        allUpdateSucceeded &&
        slots.some((slot) => slot.googleCalendarEventId !== null)
      ) {
        await markEventCalendarSyncSuccess(eventId);
      }
      continue;
    }

    if (
      syncError !== null &&
      isMeetOnlyCalendarSyncError(syncError) &&
      slots.some((slot) => slot.googleCalendarEventId !== null)
    ) {
      const slotWithGcal = slots.find(
        (slot) => slot.googleCalendarEventId !== null,
      );
      const gcalEventId = slotWithGcal?.googleCalendarEventId;
      if (
        slotWithGcal !== undefined &&
        gcalEventId !== null &&
        gcalEventId !== undefined
      ) {
        total++;
        const result = await retryEventMeetUrlWriteBack({
          eventId,
          googleCalendarEventId: gcalEventId,
          meetingProvider: slotWithGcal.meetingProvider,
        });
        if (result.success) {
          succeeded++;
          await markEventCalendarSyncSuccess(eventId);
        } else {
          failed++;
          if (result.error) {
            await markEventCalendarSyncError({ eventId, error: result.error });
          }
        }
      }
      continue;
    }

    // 上記いずれにも該当しない event-level エラーは admin dashboard 側の可視化に委ねる。
  }

  return { total, succeeded, failed };
}
