/**
 * イベントインポート Cron API
 *
 * Cloud Scheduler から定期的に呼び出され、
 * Google Calendarの非予約イベントをEventモデルにインポートします。
 *
 * @module api/cron/event-import
 */

import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS, CACHE_LIFE } from "@/shared/lib/constants";
import { importCalendarEvents } from "@/shared/lib/calendar-sync/event-inbound";
import { isGoogleCalendarEnabled } from "@/shared/lib/google-calendar";
import { getEventImportSettings } from "@/shared/domain/settings/admin-queries";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";

/**
 * イベントインポート用Cronエンドポイント
 * GET /api/cron/event-import
 *
 * Cloud Scheduler から呼び出される
 * Google Calendarの非予約イベントをEventモデルにインポート
 *
 * セキュリティ: Cloud Scheduler OIDC token による認証
 */
export async function GET(request: Request) {
  try {
    await connection();
    const authorizationResult = await authorizeCronRequest({
      request,
      operation: "eventImportCron",
    });
    if (authorizationResult) {
      return authorizationResult;
    }

    // Feature module gate — events OFF なら早期 return（DB / GCal 接続を一切しない）
    if (!(await isFeatureEnabled("events"))) {
      return jsonSuccess({ skipped: true, reason: "feature_disabled" });
    }

    // Google Calendar が有効か確認
    const calendarEnabled = await isGoogleCalendarEnabled();
    if (!calendarEnabled) {
      return jsonSuccess({
        skipped: true,
        reason: "Google Calendar is not enabled",
      });
    }

    // イベントインポートが有効か確認
    const settings = await getEventImportSettings();
    if (!settings.eventImportEnabled) {
      return jsonSuccess({
        skipped: true,
        reason: "Event import is disabled",
      });
    }

    // インポート実行
    const result = await importCalendarEvents();

    if (!result.success) {
      logError(new Error("Event import failed"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: "importCalendarEvents", errors: result.errors },
      });
      return jsonError("Event import failed", 503);
    }

    // 変更があった場合のみキャッシュ無効化
    if (result.imported > 0 || result.updated > 0) {
      revalidateTag(CACHE_TAGS.EVENTS, CACHE_LIFE.PUBLIC_CONTENT);
    }

    return jsonSuccess({
      imported: result.imported,
      updated: result.updated,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: "eventImportCron" },
    });
    return jsonError("Event import cron failed", 500);
  }
}
