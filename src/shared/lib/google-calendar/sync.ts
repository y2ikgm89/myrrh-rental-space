import "server-only";

import { type calendar_v3 } from "googleapis";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors";
import { prisma } from "@/shared/lib/prisma";
import type { CalendarChange, SyncChangesResult } from "./types";
import { formatGoogleApiError } from "./helpers";
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

  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { googleCalendarId: true },
  });

  if (!settings?.googleCalendarId) {
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
        calendarId: settings.googleCalendarId,
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

      const response = await client.events.list(params);

      for (const event of response.data.items ?? []) {
        if (!event.id) continue;

        // 予約システムで作成されたイベントのみを対象（descriptionに予約IDが含まれる）
        const isReservationEvent = event.description?.includes("予約ID:");

        if (isReservationEvent) {
          changes.push({
            eventId: event.id,
            status:
              event.status === "cancelled"
                ? "cancelled"
                : event.status === "tentative"
                  ? "tentative"
                  : "confirmed",
            summary: event.summary ?? undefined,
            startTime: event.start?.dateTime
              ? new Date(event.start.dateTime)
              : undefined,
            endTime: event.end?.dateTime
              ? new Date(event.end.dateTime)
              : undefined,
            updatedAt: event.updated ? new Date(event.updated) : new Date(),
            deleted: event.status === "cancelled",
          });
        }
      }

      pageToken = response.data.nextPageToken ?? undefined;
      newSyncToken = response.data.nextSyncToken ?? undefined;
    } while (pageToken);

    return {
      success: true,
      changes,
      newSyncToken,
    };
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
