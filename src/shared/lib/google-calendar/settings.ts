import "server-only";

import { google } from "googleapis";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import type { CalendarConnectionTestResult } from "./types";
import { omitUndefined } from "@/shared/lib/serialize";
import { formatGoogleApiError } from "./helpers";
import { withGoogleApiRetry } from "@/shared/lib/google-api/retry";
import { parseGoogleServiceAccountCredentials } from "@/shared/lib/validations/google-service-account";
import { isValidCalendarId } from "./calendar-id";

export { isValidCalendarId };

/**
 * サービスアカウントの接続テスト（純粋 API 層。Settings I/O なし）。
 */
export async function testServiceAccountConnection(params: {
  serviceAccountJson: string;
  calendarId: string;
}): Promise<CalendarConnectionTestResult> {
  try {
    const credentials = parseGoogleServiceAccountCredentials(
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
