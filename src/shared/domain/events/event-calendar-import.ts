/**
 * Google Calendar → Event モデル（イベントインポート）orchestration。
 *
 * GCal API fetch は lib (`event-inbound-fetch`)、Settings / Event R-W は
 * 本モジュール + `event-calendar-import-commands` / `calendar-sync` が担当する。
 *
 * @module shared/domain/events/event-calendar-import
 */

import "server-only";

import {
  cancelImportedEventFromCalendar,
  upsertEventFromCalendar,
} from "@/shared/domain/events/event-calendar-import-commands";
import {
  clearEventImportSyncToken,
  getEventImportSyncToken,
  saveEventImportSyncToken,
} from "@/shared/domain/events/calendar-sync";
import {
  getGoogleCalendarServiceAccountConfig,
  getGoogleCalendarSettings,
} from "@/shared/domain/settings/admin-queries";
import { fetchEventImportChanges } from "@/shared/lib/calendar-sync/event-inbound-fetch";
import { safeDecryptToString } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { logger } from "@/shared/lib/errors/logger-core";
import { isGoogleCalendarFullSyncRequired } from "@/shared/lib/google-api/retry";
import { formatGoogleApiError } from "@/shared/lib/google-calendar/helpers";
import { createCalendarClientFromServiceAccountJson } from "@/shared/lib/google-calendar/service-account";

export interface EventImportResult {
  success: boolean;
  imported: number;
  updated: number;
  /**
   * 公開済み / アクティブ申込あり等で inbound 上書きをスキップした件数。
   * 失敗ではなく、errors には含めない。
   */
  skipped: number;
  /** GCal 上で cancelled になった import 済みイベントを CANCELLED に遷移させた件数 */
  cancelled: number;
  errors: string[];
}

/**
 * Google Calendar からイベントをインポート
 *
 * 以下の GCal イベントはスキップし、残りを Event モデルに upsert する:
 * - description に "予約ID:" を含むイベント（outbound.ts が書き込んだ予約）
 * - description に "イベントID:" を含むイベント（event-calendar-outbound が書き込んだ本アプリのイベント — ループ防止）
 */
export async function importCalendarEvents(): Promise<EventImportResult> {
  const result: EventImportResult = {
    success: true,
    imported: 0,
    updated: 0,
    skipped: 0,
    cancelled: 0,
    errors: [],
  };

  const serviceAccount = await getGoogleCalendarServiceAccountConfig();
  if (!serviceAccount.enabled || !serviceAccount.encryptedServiceAccountJson) {
    return {
      ...result,
      success: false,
      errors: ["Google Calendar is not configured"],
    };
  }

  const decryptedJson = safeDecryptToString(
    serviceAccount.encryptedServiceAccountJson,
    {
      expectedPurpose: SETTINGS_CRYPTO_PURPOSES.googleCalendarServiceAccount,
    },
  );
  if (!decryptedJson) {
    return {
      ...result,
      success: false,
      errors: ["Google Calendar is not configured"],
    };
  }

  const client = createCalendarClientFromServiceAccountJson(
    decryptedJson,
    "importCalendarEvents",
  );
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

  const eventImportSyncToken = await getEventImportSyncToken();

  try {
    const fetchResult = await fetchEventImportChanges(
      client,
      calendarSettings.calendarId,
      eventImportSyncToken,
    );

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
        } else if (upsertResult.action === "updated") {
          result.updated++;
        } else {
          // published / active registrations 保護による skip。失敗扱いにしない。
          result.skipped++;
          logger.info("Calendar event import skipped", {
            googleCalendarEventId: event.id,
            eventId: upsertResult.id,
            reason: upsertResult.reason,
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        result.errors.push(`Event ${event.id}: ${errorMessage}`);
      }
    }

    // GCAL-AUDIT-10: GCal 上で cancelled になった import 済みイベントを
    // CANCELLED に遷移させる（旧実装は cancelled イベントを黙って skip するのみで、
    // 削除・キャンセルが Event 側に一切反映されなかった）。
    for (const cancelledId of fetchResult.cancelledEventIds) {
      try {
        const cancelResult = await cancelImportedEventFromCalendar(cancelledId);
        if (cancelResult.cancelled) {
          result.cancelled++;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        result.errors.push(`Event ${cancelledId} (cancel): ${errorMessage}`);
      }
    }

    // syncToken は全イベント upsert が成功したときのみ保存する (inbound.ts と同型)。
    if (result.errors.length === 0 && fetchResult.newSyncToken) {
      await saveEventImportSyncToken(fetchResult.newSyncToken);
    }

    result.success = result.errors.length === 0;

    logger.info("Calendar event import completed", {
      imported: result.imported,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.length,
    });

    return result;
  } catch (error) {
    // 410 Gone / reason: fullSyncRequired — syncToken が期限切れ、リセットしてフルシンク
    if (isGoogleCalendarFullSyncRequired(error)) {
      logger.info("Event import syncToken expired, performing full sync");
      await clearEventImportSyncToken();
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
