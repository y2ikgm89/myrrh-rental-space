/**
 * Google Calendar → Event import 用の GCal API fetch（純粋 API 層）。
 *
 * DB / Settings は触らない。orchestration は domain 側
 * (`importCalendarEvents`) が担当する。
 *
 * @module shared/lib/calendar-sync/event-inbound-fetch
 */

import "server-only";

import { type calendar_v3 } from "googleapis";

import { isAppGeneratedCalendarEvent } from "./loop-prevention";
import { withGoogleApiRetry } from "@/shared/lib/google-api/retry";

export interface ParsedCalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  location: string | null;
}

export interface FetchEventChangesResult {
  events: ParsedCalendarEvent[];
  /** GCal 上で cancelled になったイベントの googleCalendarEventId 一覧 */
  cancelledEventIds: string[];
  newSyncToken: string | undefined;
}

/**
 * カレンダーから必要分のイベント変更を取得（syncToken / ページネーション対応）。
 *
 * アプリ outbound 由来イベントはスキップし、cancelled は ID のみ返す。
 */
export async function fetchEventImportChanges(
  client: calendar_v3.Calendar,
  calendarId: string,
  syncToken: string | null | undefined,
): Promise<FetchEventChangesResult> {
  const events: ParsedCalendarEvent[] = [];
  const cancelledEventIds: string[] = [];
  let pageToken: string | undefined;
  let newSyncToken: string | undefined;

  // 初回同期: 過去1ヶ月〜将来3ヶ月
  const now = new Date();
  const timeMin = new Date(now);
  timeMin.setMonth(timeMin.getMonth() - 1);
  const timeMax = new Date(now);
  timeMax.setMonth(timeMax.getMonth() + 3);

  do {
    const params: calendar_v3.Params$Resource$Events$List = {
      calendarId,
      maxResults: 250,
      singleEvents: true,
      showDeleted: true,
    };

    if (syncToken) {
      params.syncToken = syncToken;
    } else {
      params.timeMin = timeMin.toISOString();
      params.timeMax = timeMax.toISOString();
      params.orderBy = "startTime";
    }

    if (pageToken) {
      params.pageToken = pageToken;
    }

    const response = await withGoogleApiRetry(() => client.events.list(params));

    for (const event of response.data.items ?? []) {
      if (!event.id) continue;

      // アプリ側 outbound 由来のイベントはスキップ（ループ防止 SSoT: loop-prevention.ts）
      if (isAppGeneratedCalendarEvent(event.description)) continue;

      // GCAL-AUDIT-10: キャンセルされたイベントは import 対象からは除外しつつ、
      // 既に import 済みなら呼出側で Event.status を CANCELLED に遷移させる
      // (旧実装は cancelled イベントを黙って skip するのみだった)。
      if (event.status === "cancelled") {
        cancelledEventIds.push(event.id);
        continue;
      }

      // dateTime が無いイベント（終日イベント等）はスキップ
      if (!event.start?.dateTime || !event.end?.dateTime) continue;

      events.push({
        id: event.id,
        title: event.summary ?? "無題のイベント",
        description: event.description ?? null,
        startTime: new Date(event.start.dateTime),
        endTime: new Date(event.end.dateTime),
        location: event.location ?? null,
      });
    }

    pageToken = response.data.nextPageToken ?? undefined;
    newSyncToken = response.data.nextSyncToken ?? undefined;
  } while (pageToken);

  return { events, cancelledEventIds, newSyncToken };
}
