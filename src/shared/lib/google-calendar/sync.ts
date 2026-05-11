import "server-only";

import { type calendar_v3 } from "googleapis";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { getGoogleCalendarSettings } from "@/shared/domain/settings/admin-queries";
import { omitUndefined } from "@/shared/lib/serialize";
import type { CalendarChange, SyncChangesResult } from "./types";
import { formatGoogleApiError } from "./helpers";
import { withGoogleApiRetry } from "@/shared/lib/google-api/retry";
import { getServiceAccountClient } from "./service-account";

/**
 * カレンダーの変更を取得（増分同期）
 *
 * syncTokenを使用して前回同期以降の変更のみを取得
 */
export async function fetchCalendarChanges(
  syncToken?: string | null,
): Promise<SyncChangesResult> {
  const client = await getServiceAccountClient();
  if (!client) {
    return {
      success: false,
      changes: [],
      error: "Google Calendar is not configured",
    };
  }

  const settings = await getGoogleCalendarSettings();

  if (!settings.calendarId) {
    return {
      success: false,
      changes: [],
      error: "Calendar ID is not configured",
    };
  }

  try {
    const changes: CalendarChange[] = [];
    let pageToken: string | undefined;
    let newSyncToken: string | undefined;

    // syncTokenがない場合は初回同期（過去1ヶ月〜将来3ヶ月を取得）
    const now = new Date();
    const timeMin = new Date(now);
    timeMin.setMonth(timeMin.getMonth() - 1);
    const timeMax = new Date(now);
    timeMax.setMonth(timeMax.getMonth() + 3);

    do {
      const params: calendar_v3.Params$Resource$Events$List = {
        calendarId: settings.calendarId,
        maxResults: 250,
        singleEvents: true,
        showDeleted: true, // 削除されたイベントも取得
      };

      if (syncToken) {
        params.syncToken = syncToken;
      } else {
        // 初回同期時は時間範囲を指定
        params.timeMin = timeMin.toISOString();
        params.timeMax = timeMax.toISOString();
        params.orderBy = "startTime";
      }

      if (pageToken) {
        params.pageToken = pageToken;
      }

      const response = await withGoogleApiRetry(() =>
        client.events.list(params),
      );

      for (const event of response.data.items ?? []) {
        if (!event.id) continue;

        // 予約システムで作成されたイベントのみを対象（descriptionに予約IDが含まれる）
        const isReservationEvent = event.description?.includes("予約ID:");

        if (isReservationEvent) {
          const change: CalendarChange = {
            eventId: event.id,
            status:
              event.status === "cancelled"
                ? "cancelled"
                : event.status === "tentative"
                  ? "tentative"
                  : "confirmed",
            updatedAt: event.updated ? new Date(event.updated) : new Date(),
            deleted: event.status === "cancelled",
            ...(event.summary != null && { summary: event.summary }),
            ...(event.start?.dateTime != null && {
              startTime: new Date(event.start.dateTime),
            }),
            ...(event.end?.dateTime != null && {
              endTime: new Date(event.end.dateTime),
            }),
          };
          changes.push(change);
        }
      }

      pageToken = response.data.nextPageToken ?? undefined;
      newSyncToken = response.data.nextSyncToken ?? undefined;
    } while (pageToken);

    return omitUndefined({
      success: true,
      changes,
      newSyncToken,
    });
  } catch (error) {
    // syncTokenが期限切れの場合はフルシンク
    if (error instanceof Error && error.message.includes("410")) {
      return fetchCalendarChanges(null);
    }

    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "fetchCalendarChanges",
        hasSyncToken: !!syncToken,
      },
    });
    return {
      success: false,
      changes: [],
      error: formatGoogleApiError(error),
    };
  }
}
