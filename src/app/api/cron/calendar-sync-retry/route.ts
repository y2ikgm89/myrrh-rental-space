/**
 * カレンダー同期リトライ Cron API (GCAL-RETRY-01)
 *
 * Cloud Scheduler から定期的に呼び出され、
 * `Reservation.calendarSyncError` が残ったまま `googleCalendarEventId` 未設定の
 * 予約を再度 Google Calendar と同期する。
 *
 * ## 背景
 *
 * `syncReservationToCalendar` / `updateCalendarSync` が失敗すると
 * `markReservationCalendarSyncError` で `Reservation.calendarSyncError` に文字列を
 * 積むが、以降に自動再送する経路が存在しなかった。管理画面から手動で
 * `retryFailedSyncs()` を呼ぶ配線もないため、外部 API 一時障害・rate limit で失敗した
 * 予約が GCal から見えないまま (admin dashboard 上の可視性欠落) 放置される silent
 * data-loss リスクがあった。本 cron が対応する予約を最大 50 件/回まで捌く。
 *
 * ## 頻度
 *
 * 15 分毎。Google Calendar API の rate limit (1000/user/100s) に配慮しつつ、
 * 一時障害の recovery を 30 分以内に完了させる想定 (max 3 retry + backoff)。
 *
 * ## 認可
 *
 * Cloud Scheduler OIDC Bearer token による認証 (`authorizeCronRequest`)。
 *
 * @module api/cron/calendar-sync-retry
 */

import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { invalidateSiteWideCacheFromRouteHandler } from "@/shared/lib/cache/site-wide";
import { retryFailedSyncs } from "@/shared/lib/calendar-sync/outbound";
import { retryFailedEventCalendarSyncs } from "@/shared/lib/calendar-sync/event-outbound";
import { isGoogleCalendarEnabled } from "@/shared/lib/google-calendar";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";

/**
 * カレンダー同期リトライ用 Cron エンドポイント
 * GET /api/cron/calendar-sync-retry
 *
 * Cloud Scheduler から呼び出される (15 分間隔)
 */
export async function GET(request: Request) {
  try {
    await connection();
    const authorizationResult = await authorizeCronRequest({
      request,
      operation: "calendarSyncRetryCron",
    });
    if (authorizationResult) {
      return authorizationResult;
    }

    // Google Calendar 連携そのものが OFF なら retry する意味がない
    // (retryFailedSyncs 内の syncReservationToCalendar も同一 gate で早期 return
    // するが、cron route 側で先に skip して不要な DB read を避ける)。
    const enabled = await isGoogleCalendarEnabled();
    if (!enabled) {
      return jsonSuccess({
        skipped: true,
        reason: "Google Calendar is disabled",
      });
    }

    // 予約側 (create/update/delete 振り分け) と event 側 (create のみ) は独立した
    // 失敗集合のため並列実行する (GCAL-AUDIT-04)。
    const [reservationResult, eventResult] = await Promise.all([
      retryFailedSyncs(),
      retryFailedEventCalendarSyncs(),
    ]);

    // 予約データの admin dashboard 表示を最新化 (calendar-sync と同型)。
    // skipCdnPurge: true — RESERVATIONS + calendar tag は admin-only private tag。
    invalidateSiteWideCacheFromRouteHandler(
      [CACHE_TAGS.RESERVATIONS, getCacheTag.reservations.calendar()],
      { skipCdnPurge: true },
    );

    return jsonSuccess({
      total: reservationResult.total + eventResult.total,
      succeeded: reservationResult.succeeded + eventResult.succeeded,
      failed: reservationResult.failed + eventResult.failed,
      reservations: reservationResult,
      events: eventResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "calendarSyncRetryCron" },
    });
    return jsonError("Calendar sync retry cron failed", 500);
  }
}
