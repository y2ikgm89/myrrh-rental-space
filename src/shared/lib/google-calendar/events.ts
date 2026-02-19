import "server-only";

import { type calendar_v3 } from "googleapis";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors";
import { prisma } from "@/shared/lib/prisma";
import type { CalendarEventParams, CalendarEventResult } from "./types";
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

  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { googleCalendarId: true },
  });

  if (!settings?.googleCalendarId) {
    return { success: false, error: "Calendar ID is not configured" };
  }

  try {
    const event: calendar_v3.Schema$Event = {
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
    };

    const response = await client.events.insert({
      calendarId: settings.googleCalendarId,
      requestBody: event,
      sendUpdates: "none",
    });

    return {
      success: true,
      eventId: response.data.id ?? undefined,
      eventUrl: response.data.htmlLink ?? undefined,
    };
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

  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { googleCalendarId: true },
  });

  if (!settings?.googleCalendarId) {
    return { success: false, error: "Calendar ID is not configured" };
  }

  try {
    const event: calendar_v3.Schema$Event = {
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
    };

    const response = await client.events.update({
      calendarId: settings.googleCalendarId,
      eventId,
      requestBody: event,
      sendUpdates: "none",
    });

    return {
      success: true,
      eventId: response.data.id ?? undefined,
      eventUrl: response.data.htmlLink ?? undefined,
    };
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

  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { googleCalendarId: true },
  });

  if (!settings?.googleCalendarId) {
    return { success: false, error: "Calendar ID is not configured" };
  }

  try {
    await client.events.delete({
      calendarId: settings.googleCalendarId,
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
    const event: calendar_v3.Schema$Event = {
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
    };

    const response = await client.events.insert({
      calendarId: "primary",
      requestBody: event,
    });

    return {
      success: true,
      eventId: response.data.id ?? undefined,
      eventUrl: response.data.htmlLink ?? undefined,
    };
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
export async function getCalendarEvent(
  eventId: string,
): Promise<{
  success: boolean;
  event?: calendar_v3.Schema$Event;
  error?: string;
}> {
  const client = await getServiceAccountClient();
  if (!client) {
    return { success: false, error: "Google Calendar is not configured" };
  }

  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { googleCalendarId: true },
  });

  if (!settings?.googleCalendarId) {
    return { success: false, error: "Calendar ID is not configured" };
  }

  try {
    const response = await client.events.get({
      calendarId: settings.googleCalendarId,
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
