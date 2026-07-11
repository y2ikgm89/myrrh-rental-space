/**
 * カレンダー同期 Cron API
 *
 * Cloud Scheduler から定期的に呼び出され、
 * Google Calendarとの双方向同期を実行します。
 *
 * ## 機能
 * - カレンダーイベントの同期（ポーリング方式）
 * - Webhookの自動更新
 * - 同期失敗時のエラー通知
 *
 * ## アーキテクチャ境界
 *
 * CLAUDE.md のアーキテクチャ境界「app 層からの Prisma 直 import 禁止」
 * 規約を遵守し、`pg_try_advisory_lock` raw query は
 * `@/shared/domain/calendar-sync/locks` helper に集約済 (route handler は
 * domain layer 経由でロックを取得/解放する)。
 *
 * 排他ロックが必要な新規 cron route は同 helper パターン
 * (`tryAcquireXxxLock` / `releaseXxxLock`) を踏襲し、`prisma` を route から
 * 直接 import しないこと。
 *
 * @module api/cron/calendar-sync
 */

import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { invalidateSiteWideCacheFromRouteHandler } from "@/shared/lib/cache/site-wide";
import {
  releaseCalendarSyncLock,
  tryAcquireCalendarSyncLock,
} from "@/shared/domain/calendar-sync/locks";
import { syncFromCalendar } from "@/shared/lib/calendar-sync/inbound";
import {
  isTwoWaySyncEnabled,
  renewWebhookIfNeeded,
} from "@/shared/lib/google-calendar";
import { getTwoWaySyncSettings } from "@/shared/domain/settings/admin-queries";
import { sendWebhookRenewalNotification } from "@/shared/lib/email/system-emails";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { fireAndForget } from "@/shared/lib/async-utils";
import { CalendarSyncMethod } from "@/shared/lib/validations/enums/prisma-types";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";

/**
 * カレンダー同期用Cronエンドポイント
 * GET /api/cron/calendar-sync
 *
 * Cloud Scheduler から呼び出される
 * 設定で指定された間隔（デフォルト5分）でカレンダーの変更をチェック
 *
 * セキュリティ: Cloud Scheduler OIDC token による認証
 */
export async function GET(request: Request) {
  try {
    await connection();
    const authorizationResult = await authorizeCronRequest({
      request,
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

    // 並行実行ロック（Cloud Run 複数インスタンス対策、domain layer 経由）
    const acquired = await tryAcquireCalendarSyncLock();
    if (!acquired) {
      return jsonSuccess({
        skipped: true,
        reason: "Another sync is already running",
      });
    }

    try {
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
              ...(renewalResult.newExpiration != null
                ? { newExpiration: renewalResult.newExpiration }
                : {}),
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
              ...(renewalResult.error != null
                ? { error: renewalResult.error }
                : {}),
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
              "Webhook更新処理でエラーが発生しました。詳細はサーバーログを確認してください。",
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

      // カレンダー同期後に予約データを最新化。cron / Route Handler の canonical
      // pattern (`invalidateSiteWideCacheFromRouteHandler` = {expire:0} + CDN purge)。
      // GCal webhook 側 (/api/webhooks/google-calendar) と同型。
      invalidateSiteWideCacheFromRouteHandler([
        CACHE_TAGS.RESERVATIONS,
        getCacheTag.reservations.calendar(),
      ]);

      return jsonSuccess({
        processed: result.processed,
        deleted: result.deleted,
        updated: result.updated,
        errors: result.errors,
        webhookRenewed,
        timestamp: new Date().toISOString(),
      });
    } finally {
      await releaseCalendarSyncLock();
    }
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
