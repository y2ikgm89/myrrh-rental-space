import "server-only";

import { google } from "googleapis";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  getGoogleCalendarSettings,
  getTwoWaySyncSettings,
} from "@/shared/domain/settings/admin-queries";
import type { CalendarConnectionTestResult } from "./types";
import { omitUndefined } from "@/shared/lib/serialize";
import { formatGoogleApiError } from "./helpers";
import { withGoogleApiRetry } from "@/shared/lib/google-api/retry";
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
 * Google Calendar 連携が稼働可能な状態か判定する（semantic helper）。
 *
 * `enabled` フラグ ON かつ接続テスト通過済みの場合のみ true。
 */
export async function isGoogleCalendarEnabled(): Promise<boolean> {
  const settings = await getGoogleCalendarSettings();
  return settings.enabled && settings.connectionStatus === "connected";
}

/**
 * 双方向同期が稼働可能な状態か判定する（semantic helper）。
 *
 * Calendar 自体が enabled + 接続 OK で、かつ two-way sync toggle が ON の場合のみ true。
 * 2 クエリを Promise.all で並行実行する（webhook route の hot path のため）。
 */
export async function isTwoWaySyncEnabled(): Promise<boolean> {
  const [calendarSettings, twoWaySyncSettings] = await Promise.all([
    getGoogleCalendarSettings(),
    getTwoWaySyncSettings(),
  ]);
  return (
    calendarSettings.enabled &&
    calendarSettings.connectionStatus === "connected" &&
    twoWaySyncSettings.enabled
  );
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
