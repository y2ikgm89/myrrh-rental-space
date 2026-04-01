/**
 * イベントインポート Cron API
 *
 * Cloud Schedulerまたは外部スケジューラーから定期的に呼び出され、
 * Google Calendarの非予約イベントをEventモデルにインポートします。
 *
 * @module api/cron/event-import
 */

import { unstable_rethrow } from "next/navigation";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS, CACHE_LIFE } from "@/shared/lib/constants";
import { importCalendarEvents } from "@/shared/lib/calendar-sync/event-inbound";
import { isGoogleCalendarEnabled } from "@/shared/lib/google-calendar";
import { prisma } from "@/shared/db/prisma";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { serverEnv } from "@/shared/lib/env/server";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";

/**
 * イベントインポート用Cronエンドポイント
 * GET /api/cron/event-import
 *
 * Cloud Schedulerまたは外部スケジューラーから呼び出される
 * Google Calendarの非予約イベントをEventモデルにインポート
 *
 * セキュリティ: CRON_SECRET環境変数による認証
 */
export async function GET(request: Request) {
  try {
    const authorizationResult = authorizeCronRequest({
      authorizationHeader: request.headers.get("authorization"),
      secret: serverEnv.CRON_SECRET,
      nodeEnv: serverEnv.NODE_ENV,
      operation: "eventImportCron",
    });
    if (authorizationResult) {
      return authorizationResult;
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
    const settings = await prisma.settings.findFirstOrThrow({
      where: { id: "singleton" },
      select: { eventImportEnabled: true },
    });
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
