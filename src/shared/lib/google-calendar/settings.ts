import "server-only";

import { google } from "googleapis";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  getGoogleCalendarSettings as getGoogleCalendarSettingsQuery,
  getTwoWaySyncSettings as getTwoWaySyncSettingsQuery,
} from "@/shared/domain/settings/admin-queries";
import type {
  GoogleCalendarSettings,
  TwoWaySyncSettings,
  CalendarConnectionTestResult,
} from "./types";
import { omitUndefined } from "@/shared/lib/serialize";
import { formatGoogleApiError } from "./helpers";
import { withGoogleApiRetry } from "./retry";
import { parseServiceAccountCredentials } from "./service-account";

/**
 * サービスアカウントの接続テスト
 */
export async function testServiceAccountConnection(params: {
  serviceAccountJson: string;
  calendarId: string;
}): Promise<CalendarConnectionTestResult> {
  try {
    const credentials = parseServiceAccountCredentials(
      params.serviceAccountJson,
    );
    if (!credentials) {
      throw new Error("Invalid service account credentials JSON");
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    });

    const calendar = google.calendar({ version: "v3", auth });

    // カレンダーのメタデータを取得して接続確認
    const response = await withGoogleApiRetry(() =>
      calendar.calendars.get({
        calendarId: params.calendarId,
      }),
    );

    return omitUndefined({
      success: true,
      calendarName: response.data.summary ?? undefined,
      accountEmail: credentials.client_email,
    });
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
  return getGoogleCalendarSettingsQuery();
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
  return getTwoWaySyncSettingsQuery();
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
