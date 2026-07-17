import "server-only";

import { type calendar_v3 } from "googleapis";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { getGoogleCalendarSettings } from "@/shared/domain/settings/admin-queries";
import type { GoogleCalendarSettingsData } from "@/shared/domain/settings/types";
import type {
  CalendarEventInstance,
  CalendarEventParams,
  CalendarEventResult,
} from "./types";
import { omitUndefined } from "@/shared/lib/serialize";
import { formatGoogleApiError } from "./helpers";
import { withGoogleApiRetry } from "@/shared/lib/google-api/retry";
import { getServiceAccountClient } from "./service-account";

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
 * - `reminders` は Settings の `reminderMinutes` を反映（null=default, 0=無効, N=N分前メール）
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
  settings: GoogleCalendarSettingsData,
  options: { includeAttendee?: boolean; withMeet?: boolean },
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
    attendees:
      options.includeAttendee && params.attendeeEmail
        ? [{ email: params.attendeeEmail }]
        : undefined,
    // Phase B.2 task 16: recurrence 指定時は master event として recurring event を作成
    // (Google Calendar API 契約、`RRULE:` prefix 込みの完全形で渡す)。空配列時は omit。
    recurrence:
      params.recurrence !== undefined && params.recurrence.length > 0
        ? params.recurrence
        : undefined,
    reminders: toReminders(settings.reminderMinutes),
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
 * カレンダーにイベントを作成
 *
 * `options.withMeet` は呼出元がイベント単位で指定する（例: `Event.meetingProvider ===
 * "GOOGLE_MEET"`）。未指定時は `false` 扱い（backward compat — Meet を発行しない）。
 */
export async function createCalendarEvent(
  params: CalendarEventParams,
  options?: { withMeet?: boolean },
): Promise<CalendarEventResult> {
  const client = await getServiceAccountClient();
  if (!client) {
    return { success: false, error: "Google Calendar is not configured" };
  }

  const settings = await getGoogleCalendarSettings();
  const calendarId = settings.calendarId;
  if (!calendarId) {
    return { success: false, error: "Calendar ID is not configured" };
  }

  try {
    const withMeet = options?.withMeet === true;
    const requestBody = buildEventBody(params, settings, {
      includeAttendee: true,
      withMeet,
    });
    const response = await withGoogleApiRetry(() =>
      client.events.insert({
        calendarId,
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
 * カレンダーイベントを更新
 */
export async function updateCalendarEvent(
  eventId: string,
  params: CalendarEventParams,
): Promise<CalendarEventResult> {
  const client = await getServiceAccountClient();
  if (!client) {
    return { success: false, error: "Google Calendar is not configured" };
  }

  const settings = await getGoogleCalendarSettings();
  const calendarId = settings.calendarId;
  if (!calendarId) {
    return { success: false, error: "Calendar ID is not configured" };
  }

  try {
    const requestBody = buildEventBody(params, settings, { withMeet: false });
    const response = await withGoogleApiRetry(() =>
      client.events.update({
        calendarId,
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
 * カレンダーイベントを部分更新 (Phase B.2.1 non-goal Task C)。
 *
 * 公式推奨: recurrence だけを更新する場合は `events.update` (full replace) より
 * `events.patch` (partial update) を使う (他の event body field を保護できる)。
 * https://developers.google.com/calendar/api/v3/reference/events/patch
 *
 * Task C 主用途: series の this-and-following scope キャンセルで master recurring
 * event の RRULE に UNTIL を注入して打ち切る (`recurrence: [rebuiltRrule]`)。
 */
export async function patchCalendarEvent(
  eventId: string,
  patch: Partial<
    Pick<
      calendar_v3.Schema$Event,
      "summary" | "description" | "location" | "recurrence"
    >
  >,
): Promise<CalendarEventResult> {
  const client = await getServiceAccountClient();
  if (!client) {
    return { success: false, error: "Google Calendar is not configured" };
  }

  const settings = await getGoogleCalendarSettings();
  const calendarId = settings.calendarId;
  if (!calendarId) {
    return { success: false, error: "Calendar ID is not configured" };
  }

  try {
    const requestBody = omitUndefined(patch);
    const response = await withGoogleApiRetry(() =>
      client.events.patch({
        calendarId,
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
 * カレンダーイベントを削除
 */
export async function deleteCalendarEvent(
  eventId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const client = await getServiceAccountClient();
  if (!client) {
    return { success: false, error: "Google Calendar is not configured" };
  }

  const settings = await getGoogleCalendarSettings();
  const calendarId = settings.calendarId;
  if (!calendarId) {
    return { success: false, error: "Calendar ID is not configured" };
  }

  try {
    await withGoogleApiRetry(() =>
      client.events.delete({
        calendarId,
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
 * 特定のイベントを取得
 */
export async function getCalendarEvent(eventId: string): Promise<{
  success: boolean;
  event?: calendar_v3.Schema$Event;
  error?: string;
}> {
  const client = await getServiceAccountClient();
  if (!client) {
    return { success: false, error: "Google Calendar is not configured" };
  }

  const settings = await getGoogleCalendarSettings();
  const calendarId = settings.calendarId;
  if (!calendarId) {
    return { success: false, error: "Calendar ID is not configured" };
  }

  try {
    const response = await withGoogleApiRetry(() =>
      client.events.get({
        calendarId,
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
 * 開始時刻を返し、呼出側 (calendar-sync/outbound.ts の write-back 経路) が
 * Reservation.googleCalendarEventId に紐付ける。`showDeleted: false` で
 * キャンセル済 occurrence は除外。
 */
export async function fetchEventInstances(masterEventId: string): Promise<{
  success: boolean;
  instances?: CalendarEventInstance[];
  error?: string;
}> {
  const client = await getServiceAccountClient();
  if (!client) {
    return { success: false, error: "Google Calendar is not configured" };
  }

  const settings = await getGoogleCalendarSettings();
  const calendarId = settings.calendarId;
  if (!calendarId) {
    return { success: false, error: "Calendar ID is not configured" };
  }

  try {
    const response = await withGoogleApiRetry(() =>
      client.events.instances({
        calendarId,
        eventId: masterEventId,
        showDeleted: false,
        maxResults: 250,
      }),
    );

    const items = response.data.items ?? [];
    const instances: CalendarEventInstance[] = [];
    for (const item of items) {
      const id = item.id;
      const startDateTime = item.start?.dateTime;
      if (id === undefined || id === null) continue;
      if (startDateTime === undefined || startDateTime === null) continue;
      instances.push({ id, startTime: new Date(startDateTime) });
    }
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
