/**
 * Google Calendar -> Event モデル（イベントインポート）
 *
 * カレンダー上の非予約イベントを Event モデルに取り込む。
 * syncToken ベースの差分同期で効率的に変更を検知。
 *
 * @module shared/lib/calendar-sync/event-inbound
 */

import "server-only";

import { type calendar_v3 } from "googleapis";
import { prisma } from "@/shared/db/prisma";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { logger } from "@/shared/lib/errors/logger-core";
import { getGoogleCalendarSettings } from "@/shared/domain/settings/admin-queries";
import { getServiceAccountClient } from "@/shared/lib/google-calendar/service-account";
import { formatGoogleApiError } from "@/shared/lib/google-calendar/helpers";
import { withGoogleApiRetry } from "@/shared/lib/google-api/retry";
import { upsertEventFromCalendar } from "@/shared/domain/events/commands";
import { isAppGeneratedCalendarEvent } from "./loop-prevention";

export interface EventImportResult {
  success: boolean;
  imported: number;
  updated: number;
  errors: string[];
}

/**
 * Google Calendar からイベントをインポート
 *
 * 以下の GCal イベントはスキップし、残りを Event モデルに upsert する:
 * - description に "予約ID:" を含むイベント（outbound.ts が書き込んだ予約）
 * - description に "イベントID:" を含むイベント（event-outbound.ts が書き込んだ本アプリのイベント — ループ防止）
 */
export async function importCalendarEvents(): Promise<EventImportResult> {
  const result: EventImportResult = {
    success: true,
    imported: 0,
    updated: 0,
    errors: [],
  };

  const client = await getServiceAccountClient();
  if (!client) {
    return {
      ...result,
      success: false,
      errors: ["Google Calendar is not configured"],
    };
  }

  const calendarSettings = await getGoogleCalendarSettings();
  if (!calendarSettings.calendarId) {
    return {
      ...result,
      success: false,
      errors: ["Calendar ID is not configured"],
    };
  }

  // 現在の syncToken を取得
  const settings = await prisma.settings.findFirstOrThrow({
    where: { id: "singleton" },
    select: { eventImportSyncToken: true },
  });

  try {
    const fetchResult = await fetchEventChanges(
      client,
      calendarSettings.calendarId,
      settings.eventImportSyncToken,
    );

    // 各イベントを処理
    for (const event of fetchResult.events) {
      try {
        const upsertResult = await upsertEventFromCalendar({
          googleCalendarEventId: event.id,
          title: event.title,
          description: event.description,
          startTime: event.startTime,
          endTime: event.endTime,
          location: event.location,
        });

        if (upsertResult.action === "created") {
          result.imported++;
        } else {
          result.updated++;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        result.errors.push(`Event ${event.id}: ${errorMessage}`);
      }
    }

    // syncToken を保存
    if (fetchResult.newSyncToken) {
      await prisma.settings.update({
        where: { id: "singleton" },
        data: { eventImportSyncToken: fetchResult.newSyncToken },
      });
    }

    result.success = result.errors.length === 0;

    logger.info("Calendar event import completed", {
      imported: result.imported,
      updated: result.updated,
      errors: result.errors.length,
    });

    return result;
  } catch (error) {
    // 410 Gone: syncToken が期限切れ — リセットしてフルシンク
    if (error instanceof Error && error.message.includes("410")) {
      logger.info("Event import syncToken expired, performing full sync");
      await prisma.settings.update({
        where: { id: "singleton" },
        data: { eventImportSyncToken: null },
      });
      return importCalendarEvents();
    }

    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "importCalendarEvents" },
    });
    return {
      ...result,
      success: false,
      errors: [formatGoogleApiError(error)],
    };
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

interface ParsedCalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  location: string | null;
}

interface FetchEventChangesResult {
  events: ParsedCalendarEvent[];
  newSyncToken: string | undefined;
}

/**
 * カレンダーからイベント変更を取得（syncToken / ページネーション対応）
 */
async function fetchEventChanges(
  client: calendar_v3.Calendar,
  calendarId: string,
  syncToken: string | null | undefined,
): Promise<FetchEventChangesResult> {
  const events: ParsedCalendarEvent[] = [];
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

      // キャンセルされたイベントはスキップ
      if (event.status === "cancelled") continue;

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

  return { events, newSyncToken };
}
