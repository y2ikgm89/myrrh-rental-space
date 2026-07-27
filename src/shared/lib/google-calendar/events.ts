import "server-only";

import { type calendar_v3 } from "googleapis";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import type {
  CalendarEventInstance,
  CalendarEventParams,
  CalendarEventResult,
  GoogleCalendarEventWriteContext,
} from "./types";
import { omitUndefined } from "@/shared/lib/serialize";
import { formatGoogleApiError } from "./helpers";
import { withGoogleApiRetry } from "@/shared/lib/google-api/retry";

/**
 * `reminderMinutes` を Google Calendar `reminders` オブジェクトに変換する。
 *
 * - null → `useDefault: true`（カレンダー側の既定に従う）
 * - 0 → `useDefault: false, overrides: []`（通知なし）
 * - N > 0 → `useDefault: false, overrides: [{ method: "email", minutes: N }]`
 */
function toReminders(
  reminderMinutes: number | null,
): calendar_v3.Schema$Event["reminders"] {
  if (reminderMinutes === null) return { useDefault: true };
  if (reminderMinutes <= 0) return { useDefault: false, overrides: [] };
  return {
    useDefault: false,
    overrides: [{ method: "email", minutes: reminderMinutes }],
  };
}

/**
 * Asia/Tokyo タイムゾーンのカレンダーイベント構築ヘルパー。
 *
 * - `reminders` は注入された `reminderMinutes` を反映（null=default, 0=無効, N=N分前メール）
 * - `conferenceData` は `options.withMeet === true` のときのみ付与（per-event 判定。
 *   site-wide の `settings.meetEnabled` トグルは Phase B.1 で廃止済み — 呼出元が
 *   `Event.meetingProvider === "GOOGLE_MEET"` 等イベント単位の条件で判定する）
 *   （Google Meet は OAuth ユーザーコンテキスト or Domain-Wide Delegation が必要）
 *
 * `export` は直接ユニットテスト用（`@/shared/lib/google-calendar` の公開バレルには
 * 含めない — 内部実装のまま）。
 */
export function buildEventBody(
  params: CalendarEventParams,
  reminderMinutes: number | null,
  options: { withMeet?: boolean },
): calendar_v3.Schema$Event {
  const withMeet = options.withMeet === true && params.startTime;
  const conferenceRequestId = withMeet
    ? `myrrh-${params.startTime.getTime()}-${Math.random().toString(36).slice(2, 10)}`
    : undefined;

  return omitUndefined({
    summary: params.summary,
    description: params.description,
    location: params.location,
    start: {
      dateTime: params.startTime.toISOString(),
      timeZone: "Asia/Tokyo",
    },
    end: {
      dateTime: params.endTime.toISOString(),
      timeZone: "Asia/Tokyo",
    },
    // Phase B.2 task 16: recurrence 指定時は master event として recurring event を作成
    // (Google Calendar API 契約、`RRULE:` prefix 込みの完全形で渡す)。空配列時は omit。
    recurrence:
      params.recurrence !== undefined && params.recurrence.length > 0
        ? params.recurrence
        : undefined,
    reminders: toReminders(reminderMinutes),
    conferenceData: withMeet
      ? {
          createRequest: {
            requestId: conferenceRequestId ?? "myrrh-fallback",
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        }
      : undefined,
  });
}

/**
 * カレンダーにイベントを作成（純粋 API 層。Settings I/O なし）。
 *
 * `options.withMeet` は呼出元がイベント単位で指定する（例: `Event.meetingProvider ===
 * "GOOGLE_MEET"`）。未指定時は `false` 扱い（Meet を発行しない）。
 */
export async function createCalendarEvent(
  ctx: GoogleCalendarEventWriteContext,
  params: CalendarEventParams,
  options?: { withMeet?: boolean },
): Promise<CalendarEventResult> {
  try {
    const withMeet = options?.withMeet === true;
    const requestBody = buildEventBody(params, ctx.reminderMinutes, {
      withMeet,
    });
    const response = await withGoogleApiRetry(() =>
      ctx.client.events.insert({
        calendarId: ctx.calendarId,
        requestBody,
        sendUpdates: "none",
        ...(withMeet ? { conferenceDataVersion: 1 } : {}),
      }),
    );

    return omitUndefined({
      success: true,
      eventId: response.data.id ?? undefined,
      eventUrl: response.data.htmlLink ?? undefined,
      event: response.data,
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "createCalendarEvent", summary: params.summary },
    });
    return {
      success: false,
      error: formatGoogleApiError(error),
    };
  }
}

/**
 * カレンダーイベントを部分更新 (予約・イベントの通常 update 経路)。
 *
 * 公式推奨: `events.update` (full replace) より `events.patch` (partial update)
 * を使い、conferenceData 等の未送信 field を GCal 側で保持する。
 * https://developers.google.com/calendar/api/v3/reference/events/patch
 *
 * 送信 field: summary / description / location / start / end / reminders /
 * recurrence (指定時のみ)。attendees / conferenceData は送らない。
 *
 * recurrence のみの狭い patch は `patchCalendarEvent` を使う。
 */
export async function updateCalendarEvent(
  ctx: GoogleCalendarEventWriteContext,
  eventId: string,
  params: CalendarEventParams,
): Promise<CalendarEventResult> {
  try {
    const requestBody = buildEventBody(params, ctx.reminderMinutes, {
      withMeet: false,
    });
    const response = await withGoogleApiRetry(() =>
      ctx.client.events.patch({
        calendarId: ctx.calendarId,
        eventId,
        requestBody,
        sendUpdates: "none",
      }),
    );

    return omitUndefined({
      success: true,
      eventId: response.data.id ?? undefined,
      eventUrl: response.data.htmlLink ?? undefined,
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "updateCalendarEvent", eventId },
    });
    return {
      success: false,
      error: formatGoogleApiError(error),
    };
  }
}

/**
 * カレンダーイベントを明示的な部分 patch (Phase B.2.1 non-goal Task C)。
 *
 * 予約・イベントの通常 field 更新は `updateCalendarEvent` を使う。
 * 本関数は caller が patch body を直接指定する狭い経路 (series master の
 * RRULE UNTIL 注入等) 専用。
 * https://developers.google.com/calendar/api/v3/reference/events/patch
 *
 * Task C 主用途: series の this-and-following scope キャンセルで master recurring
 * event の RRULE に UNTIL を注入して打ち切る (`recurrence: [rebuiltRrule]`)。
 */
export async function patchCalendarEvent(
  ctx: GoogleCalendarEventWriteContext,
  eventId: string,
  patch: Partial<
    Pick<
      calendar_v3.Schema$Event,
      "summary" | "description" | "location" | "recurrence"
    >
  >,
): Promise<CalendarEventResult> {
  try {
    const requestBody = omitUndefined(patch);
    const response = await withGoogleApiRetry(() =>
      ctx.client.events.patch({
        calendarId: ctx.calendarId,
        eventId,
        requestBody,
        sendUpdates: "none",
      }),
    );

    return omitUndefined({
      success: true,
      eventId: response.data.id ?? undefined,
      eventUrl: response.data.htmlLink ?? undefined,
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "patchCalendarEvent", eventId },
    });
    return {
      success: false,
      error: formatGoogleApiError(error),
    };
  }
}

/**
 * カレンダーイベントを削除（純粋 API 層）。
 *
 * `ignoreEnabledToggle` 等の semantic gate は呼び出し側（domain）が
 * client 解決時に担当する。
 */
export async function deleteCalendarEvent(
  ctx: GoogleCalendarEventWriteContext,
  eventId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await withGoogleApiRetry(() =>
      ctx.client.events.delete({
        calendarId: ctx.calendarId,
        eventId,
        sendUpdates: "none",
      }),
    );

    return { success: true };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "deleteCalendarEvent", eventId },
    });
    return {
      success: false,
      error: formatGoogleApiError(error),
    };
  }
}

/**
 * 既存 GCal event に Google Meet conference を付与する (Meet URL retry 用)。
 *
 * `events.patch` + `conferenceDataVersion: 1` で `conferenceData.createRequest` を
 * 送る。conference 生成は非同期のため、応答に URL が無い場合は caller が
 * `getCalendarEvent` で再取得する (公式 guide の create-on-existing-event パターン)。
 */
export async function addMeetConferenceToCalendarEvent(
  ctx: GoogleCalendarEventWriteContext,
  eventId: string,
): Promise<CalendarEventResult> {
  try {
    const requestBody: calendar_v3.Schema$Event = {
      conferenceData: {
        createRequest: {
          requestId: `myrrh-retry-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    };
    const response = await withGoogleApiRetry(() =>
      ctx.client.events.patch({
        calendarId: ctx.calendarId,
        eventId,
        requestBody,
        sendUpdates: "none",
        conferenceDataVersion: 1,
      }),
    );

    return omitUndefined({
      success: true,
      eventId: response.data.id ?? undefined,
      eventUrl: response.data.htmlLink ?? undefined,
      event: response.data,
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "addMeetConferenceToCalendarEvent", eventId },
    });
    return {
      success: false,
      error: formatGoogleApiError(error),
    };
  }
}

/**
 * 特定のイベントを取得（純粋 API 層）。
 */
export async function getCalendarEvent(
  ctx: GoogleCalendarEventWriteContext,
  eventId: string,
): Promise<{
  success: boolean;
  event?: calendar_v3.Schema$Event;
  error?: string;
}> {
  try {
    const response = await withGoogleApiRetry(() =>
      ctx.client.events.get({
        calendarId: ctx.calendarId,
        eventId,
      }),
    );

    return { success: true, event: response.data };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: { operation: "getCalendarEvent", eventId },
    });
    return { success: false, error: formatGoogleApiError(error) };
  }
}

/**
 * Recurring event の master ID から展開済み occurrence 一覧を取得する
 * (Phase B.2 task 16)。
 *
 * Google Calendar API `events.instances(masterId)` の wrapper。RRULE から展開された
 * 各 occurrence の child event ID (`{masterId}_{yyyymmddTHHMMSSZ}` 形式) と
 * 開始時刻を返し、呼出側 (reservation / calendar-sync outbound の write-back 経路) が
 * Reservation.googleCalendarEventId に紐付ける。`showDeleted: false` で
 * キャンセル済 occurrence は除外。
 *
 * GCAL-AUDIT-06: `nextPageToken` を追ってページネーションする（`fetchCalendarChanges`
 * と同型）。旧実装は 1 ページ (最大 250 件) で打ち切っており、
 * 250 件超の occurrence を持つ長期 series は後半 instance が write-back されず
 * `Reservation.googleCalendarEventId` が null のまま残っていた。
 */
export async function fetchEventInstances(
  ctx: GoogleCalendarEventWriteContext,
  masterEventId: string,
): Promise<{
  success: boolean;
  instances?: CalendarEventInstance[];
  error?: string;
}> {
  try {
    const instances: CalendarEventInstance[] = [];
    let pageToken: string | undefined;

    do {
      const response = await withGoogleApiRetry(() =>
        ctx.client.events.instances(
          omitUndefined({
            calendarId: ctx.calendarId,
            eventId: masterEventId,
            showDeleted: false,
            maxResults: 250,
            pageToken,
          }),
        ),
      );

      const items = response.data.items ?? [];
      for (const item of items) {
        const id = item.id;
        const startDateTime = item.start?.dateTime;
        if (id === undefined || id === null) continue;
        if (startDateTime === undefined || startDateTime === null) continue;
        instances.push({ id, startTime: new Date(startDateTime) });
      }

      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

    return { success: true, instances };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "fetchEventInstances", masterEventId },
    });
    return { success: false, error: formatGoogleApiError(error) };
  }
}
