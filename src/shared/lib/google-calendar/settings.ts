import "server-only";

import { google } from "googleapis";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors";
import { prisma } from "@/shared/lib/prisma";
import { CalendarSyncMethod } from "@/shared/generated/prisma/enums";
import type {
  GoogleCalendarSettings,
  TwoWaySyncSettings,
  CalendarConnectionTestResult,
} from "./types";
import { formatGoogleApiError } from "./helpers";

/**
 * サービスアカウントの接続テスト
 */
export async function testServiceAccountConnection(params: {
  serviceAccountJson: string;
  calendarId: string;
}): Promise<CalendarConnectionTestResult> {
  try {
    const credentials = JSON.parse(params.serviceAccountJson) as {
      client_email?: string;
    };

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    });

    const calendar = google.calendar({ version: "v3", auth });

    // カレンダーのメタデータを取得して接続確認
    const response = await calendar.calendars.get({
      calendarId: params.calendarId,
    });

    return {
      success: true,
      calendarName: response.data.summary ?? undefined,
      accountEmail: credentials.client_email,
    };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "testServiceAccountConnection",
        calendarId: params.calendarId,
      },
    });
    return {
      success: false,
      error: formatGoogleApiError(error),
    };
  }
}

/**
 * Google Calendar設定を取得
 */
export async function getGoogleCalendarSettings(): Promise<GoogleCalendarSettings> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      googleCalendarEnabled: true,
      googleCalendarId: true,
      googleCalendarConnectionStatus: true,
      googleCalendarLastTestedAt: true,
      googleCalendarOAuthEnabled: true,
    },
  });

  const connectionStatus = settings?.googleCalendarConnectionStatus;
  const validStatus =
    connectionStatus === "connected" || connectionStatus === "error"
      ? connectionStatus
      : null;

  return {
    enabled: settings?.googleCalendarEnabled ?? false,
    calendarId: settings?.googleCalendarId ?? null,
    connectionStatus: validStatus,
    lastTestedAt: settings?.googleCalendarLastTestedAt ?? null,
    oauthEnabled: settings?.googleCalendarOAuthEnabled ?? false,
  };
}

/**
 * Google Calendar接続が有効かどうか
 */
export async function isGoogleCalendarEnabled(): Promise<boolean> {
  const settings = await getGoogleCalendarSettings();
  return settings.enabled && settings.connectionStatus === "connected";
}

/**
 * 双方向同期設定を取得
 */
export async function getTwoWaySyncSettings(): Promise<TwoWaySyncSettings> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      googleCalendarTwoWaySyncEnabled: true,
      googleCalendarSyncMethod: true,
      googleCalendarPollingIntervalMin: true,
      googleCalendarLastSyncedAt: true,
      googleCalendarWebhookExpiration: true,
    },
  });

  const syncMethod = settings?.googleCalendarSyncMethod;
  const validMethod =
    syncMethod === CalendarSyncMethod.polling ||
    syncMethod === CalendarSyncMethod.webhook ||
    syncMethod === CalendarSyncMethod.both
      ? syncMethod
      : CalendarSyncMethod.polling;

  return {
    enabled: settings?.googleCalendarTwoWaySyncEnabled ?? false,
    syncMethod: validMethod,
    pollingIntervalMin: settings?.googleCalendarPollingIntervalMin ?? 5,
    lastSyncedAt: settings?.googleCalendarLastSyncedAt ?? null,
    webhookExpiration: settings?.googleCalendarWebhookExpiration ?? null,
  };
}

/**
 * 双方向同期が有効かどうか（ポーリング用）
 */
export async function isTwoWaySyncEnabled(): Promise<boolean> {
  const settings = await getTwoWaySyncSettings();
  const calendarEnabled = await isGoogleCalendarEnabled();
  return calendarEnabled && settings.enabled;
}

/**
 * カレンダーIDのバリデーション
 */
export function isValidCalendarId(calendarId: string): boolean {
  if (!calendarId) return false;
  // カレンダーIDはメールアドレス形式または "primary"
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return calendarId === "primary" || emailRegex.test(calendarId);
}
