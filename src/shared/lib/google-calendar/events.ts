import "server-only";

import { type calendar_v3 } from "googleapis";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { getGoogleCalendarSettings } from "@/shared/domain/settings/admin-queries";
import type { CalendarEventParams, CalendarEventResult } from "./types";
import { omitUndefined } from "@/shared/lib/serialize";
import { formatGoogleApiError } from "./helpers";
import { getServiceAccountClient } from "./service-account";
import { getOAuthClient } from "./oauth";

/**
 * カレンダーにイベントを作成
 */
export async function createCalendarEvent(
  params: CalendarEventParams,
): Promise<CalendarEventResult> {
  const client = await getServiceAccountClient();
  if (!client) {
    return { success: false, error: "Google Calendar is not configured" };
  }

  const settings = await getGoogleCalendarSettings();

  if (!settings.calendarId) {
    return { success: false, error: "Calendar ID is not configured" };
  }

  try {
    const event: calendar_v3.Schema$Event = omitUndefined({
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
      attendees: params.attendeeEmail
        ? [{ email: params.attendeeEmail }]
        : undefined,
    });

    const response = await client.events.insert({
      calendarId: settings.calendarId,
      requestBody: event,
      sendUpdates: "none",
    });

    return omitUndefined({
      success: true,
      eventId: response.data.id ?? undefined,
      eventUrl: response.data.htmlLink ?? undefined,
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

  if (!settings.calendarId) {
    return { success: false, error: "Calendar ID is not configured" };
  }

  try {
    const event: calendar_v3.Schema$Event = omitUndefined({
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
    });

    const response = await client.events.update({
      calendarId: settings.calendarId,
      eventId,
      requestBody: event,
      sendUpdates: "none",
    });

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
): Promise<{ success: boolean; error?: string }> {
  const client = await getServiceAccountClient();
  if (!client) {
    return { success: false, error: "Google Calendar is not configured" };
  }

  const settings = await getGoogleCalendarSettings();

  if (!settings.calendarId) {
    return { success: false, error: "Calendar ID is not configured" };
  }

  try {
    await client.events.delete({
      calendarId: settings.calendarId,
      eventId,
      sendUpdates: "none",
    });

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
 * OAuth連携された管理者の個人カレンダーにイベントを作成
 */
export async function createOAuthCalendarEvent(
  userId: string,
  params: CalendarEventParams,
): Promise<CalendarEventResult> {
  const client = await getOAuthClient(userId);
  if (!client) {
    return { success: false, error: "OAuth is not connected" };
  }

  try {
    const event: calendar_v3.Schema$Event = omitUndefined({
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
    });

    const response = await client.events.insert({
      calendarId: "primary",
      requestBody: event,
    });

    return omitUndefined({
      success: true,
      eventId: response.data.id ?? undefined,
      eventUrl: response.data.htmlLink ?? undefined,
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "createOAuthCalendarEvent",
        userId,
        summary: params.summary,
      },
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

  if (!settings.calendarId) {
    return { success: false, error: "Calendar ID is not configured" };
  }

  try {
    const response = await client.events.get({
      calendarId: settings.calendarId,
      eventId,
    });

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
