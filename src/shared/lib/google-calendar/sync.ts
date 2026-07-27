import "server-only";

import { type calendar_v3 } from "googleapis";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { omitUndefined } from "@/shared/lib/serialize";
import type {
  CalendarChange,
  GoogleCalendarClientContext,
  SyncChangesResult,
} from "./types";
import { formatGoogleApiError } from "./helpers";
import {
  isGoogleCalendarFullSyncRequired,
  withGoogleApiRetry,
} from "@/shared/lib/google-api/retry";

export type FetchCalendarChangesOptions = {
  /**
   * syncToken が期限切れ（410 Gone / reason: fullSyncRequired）のとき、
   * 永続化済み token のクリア等を呼出側（domain）が行うための hook。
   * 指定時は hook 完了後に `syncToken=null` でフルシンクを再実行する。
   */
  onFullSyncRequired?: () => Promise<void>;
};

/**
 * カレンダーの変更を取得（増分同期。純粋 API 層）。
 *
 * syncToken を使用して前回同期以降の変更のみを取得する。
 * Settings / syncToken 永続化は呼び出し側（domain）が担当する。
 */
export async function fetchCalendarChanges(
  ctx: GoogleCalendarClientContext,
  syncToken?: string | null,
  options?: FetchCalendarChangesOptions,
): Promise<SyncChangesResult> {
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
        calendarId: ctx.calendarId,
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
        ctx.client.events.list(params),
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
    // syncToken が期限切れ（410 Gone / reason: fullSyncRequired）の場合は
    // 呼出側 hook で永続化済み token をクリアしてからフルシンクをやり直す
    // （公式仕様: 期限切れ token を握り続けると次回以降も同じ 410 を繰り返す）。
    if (
      isGoogleCalendarFullSyncRequired(error) &&
      options?.onFullSyncRequired
    ) {
      await options.onFullSyncRequired();
      return fetchCalendarChanges(ctx, null);
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
