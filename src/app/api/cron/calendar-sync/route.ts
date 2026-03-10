/**
 * カレンダー同期 Cron API
 *
 * Cloud Schedulerまたは外部スケジューラーから定期的に呼び出され、
 * Google Calendarとの双方向同期を実行します。
 *
 * ## 機能
 * - カレンダーイベントの同期（ポーリング方式）
 * - Webhookの自動更新
 * - 同期失敗時のエラー通知
 *
 * @module api/cron/calendar-sync
 */

import { unstable_rethrow } from "next/navigation";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS, CACHE_LIFE, getCacheTag } from "@/shared/lib/constants";
import { syncFromCalendar } from "@/shared/lib/calendar-sync";
import {
  isTwoWaySyncEnabled,
  getTwoWaySyncSettings,
  renewWebhookIfNeeded,
} from "@/shared/lib/google-calendar";
import { sendWebhookRenewalNotification } from "@/shared/lib/email-service";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { fireAndForget } from "@/shared/lib/async-utils";
import { CalendarSyncMethod } from "@/shared/db/enums";
import { serverEnv } from "@/shared/lib/env/server";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";

/**
 * カレンダー同期用Cronエンドポイント
 * GET /api/cron/calendar-sync
 *
 * Cloud Schedulerまたは外部スケジューラーから呼び出される
 * 設定で指定された間隔（デフォルト5分）でカレンダーの変更をチェック
 *
 * セキュリティ: CRON_SECRET環境変数による認証
 */
export async function GET(request: Request) {
  try {
    const authorizationResult = authorizeCronRequest({
      authorizationHeader: request.headers.get("authorization"),
      secret: serverEnv.CRON_SECRET,
      nodeEnv: serverEnv.NODE_ENV,
      operation: "calendarSyncCron",
    });
    if (authorizationResult) {
      return authorizationResult;
    }

    // 双方向同期が有効か確認
    const enabled = await isTwoWaySyncEnabled();
    if (!enabled) {
      return jsonSuccess({
        skipped: true,
        reason: "Two-way sync is disabled",
      });
    }

    // 同期方式を確認（pollingまたはbothの場合のみ実行）
    const settings = await getTwoWaySyncSettings();
    if (settings.syncMethod === CalendarSyncMethod.webhook) {
      return jsonSuccess({
        skipped: true,
        reason: "Polling is disabled (webhook only)",
      });
    }

    // Webhook自動更新チェック（有効期限2日前に更新）
    let webhookRenewed = false;
    try {
      const renewalResult = await renewWebhookIfNeeded();
      if (renewalResult.renewed) {
        webhookRenewed = true;
        // 成功メール通知（バックグラウンド）
        fireAndForget(
          sendWebhookRenewalNotification({
            success: true,
            newExpiration: renewalResult.newExpiration,
          }),
          {
            operation: "sendWebhookRenewalNotificationSuccess",
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.LOW,
          },
        );
      } else if (!renewalResult.success) {
        // 更新失敗時のメール通知
        logError(new Error(renewalResult.error || "Webhook renewal failed"), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: { operation: "renewWebhookIfNeeded" },
        });
        fireAndForget(
          sendWebhookRenewalNotification({
            success: false,
            error: renewalResult.error,
          }),
          {
            operation: "sendWebhookRenewalNotificationFailure",
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.LOW,
          },
        );
      }
    } catch (renewalError) {
      // Webhook更新エラーはログ記録のみ（同期処理は継続）
      logError(normalizeError(renewalError), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: "renewWebhookIfNeeded", phase: "catch" },
      });
      fireAndForget(
        sendWebhookRenewalNotification({
          success: false,
          error:
            renewalError instanceof Error
              ? renewalError.message
              : "Unknown error",
        }),
        {
          operation: "sendWebhookRenewalNotificationError",
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.LOW,
        },
      );
    }

    // 同期実行
    const result = await syncFromCalendar();

    if (!result.success) {
      logError(new Error("Calendar sync failed"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: "syncFromCalendar", errors: result.errors },
      });
      return jsonError("Calendar sync failed", 503);
    }

    // キャッシュ無効化: カレンダー同期後に予約データを最新化
    revalidateTag(CACHE_TAGS.RESERVATIONS, CACHE_LIFE.DYNAMIC_DATA);
    revalidateTag(getCacheTag.reservations.calendar(), CACHE_LIFE.DYNAMIC_DATA);

    return jsonSuccess({
      processed: result.processed,
      deleted: result.deleted,
      updated: result.updated,
      errors: result.errors,
      webhookRenewed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: "calendarSyncCron" },
    });
    return jsonError("Calendar sync cron failed", 500);
  }
}
