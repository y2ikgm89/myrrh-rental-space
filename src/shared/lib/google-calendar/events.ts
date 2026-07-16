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
import type { CalendarEventParams, CalendarEventResult } from "./types";
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
