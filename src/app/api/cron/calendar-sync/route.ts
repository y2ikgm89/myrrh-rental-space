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
 * ## GCAL-AUDIT-02: syncMethod 別の実行計画
 *
 * `syncMethod` が `webhook` の場合、旧実装は「polling 無効」を理由に
 * webhook 更新チェックへ到達する前に早期 return していた。webhook は
 * 自身を再登録できない（Google Calendar watch channel は最大 7 日で失効し、
 * 外部からの明示的な re-watch が必須）ため、webhook-only 運用では
 * `renewWebhookIfNeeded` を呼ぶ経路がこの cron しか存在せず、結果として
 * webhook 期限切れ後に双方向同期が完全に停止していた（サイレント障害）。
 *
 * `resolveSyncPlan` で syncMethod ごとに「renew すべきか」「poll すべきか」を
 * 独立に判定し、両方が false になり得ない（enum は 3 値のいずれか）前提で
 * 排他ロックを 1 回だけ取得してから両ステップを実行する。
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
import { syncFromCalendar } from "@/shared/domain/reservations/reservation-calendar-inbound";
import {
  isTwoWaySyncEnabled,
  renewWebhookIfNeeded,
} from "@/shared/domain/settings/google-calendar";
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

interface SyncPlan {
  /** webhook watch channel の renew チェックを実行するか */
  renewWebhook: boolean;
  /** ポーリング (`syncFromCalendar`) を実行するか */
  poll: boolean;
}

/**
 * syncMethod から実行計画を導出する。
 *
 * - `polling` → poll のみ（webhook 未設定のため renew は無意味）
 * - `webhook` → renew のみ（GCAL-AUDIT-02: 旧実装はここが早期 skip され、
 *   webhook-only 運用で watch channel が誰にも re-watch されなかった）
 * - `both` → 両方実行
 */
export function resolveSyncPlan(method: CalendarSyncMethod): SyncPlan {
  switch (method) {
    case CalendarSyncMethod.polling:
      return { renewWebhook: false, poll: true };
    case CalendarSyncMethod.webhook:
      return { renewWebhook: true, poll: false };
    case CalendarSyncMethod.both:
      return { renewWebhook: true, poll: true };
    default: {
      const _exhaustive: never = method;
      return _exhaustive;
    }
  }
}

/**
 * Webhook 自動更新チェック（有効期限2日前に更新）+ 結果通知メール。
 * 例外は内部で吸収し、呼出側の同期処理を妨げない。
 */
async function renewWebhookAndNotify(): Promise<{ webhookRenewed: boolean }> {
  try {
    const renewalResult = await renewWebhookIfNeeded();
    if (renewalResult.renewed) {
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
      return { webhookRenewed: true };
    }

    if (!renewalResult.success) {
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
    return { webhookRenewed: false };
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
    return { webhookRenewed: false };
  }
}

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

    // GCAL-AUDIT-02: syncMethod ごとに renew / poll を独立に判定する
    // (webhook-only でも renew は必ず実行する)。
    const settings = await getTwoWaySyncSettings();
    const plan = resolveSyncPlan(settings.syncMethod);

    // 並行実行ロック（Cloud Run 複数インスタンス対策、domain layer 経由）。
    // renew のみの実行でも Settings 更新を伴うため同一ロックで排他する。
    const acquired = await tryAcquireCalendarSyncLock();
    if (!acquired) {
      return jsonSuccess({
        skipped: true,
        reason: "Another sync is already running",
      });
    }

    try {
      const { webhookRenewed } = plan.renewWebhook
        ? await renewWebhookAndNotify()
        : { webhookRenewed: false };

      if (!plan.poll) {
        return jsonSuccess({
          skipped: true,
          reason: "Polling is disabled (webhook only)",
          webhookRenewed,
        });
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
      // skipCdnPurge: true — RESERVATIONS + calendar tag は全て admin-only の
      // private tag。CDN 経路に emit されないため SITEMAP co-purge を Cloudflare に
      // 飛ばす意味が無く、cron 頻度で purge quota を不必要に消費するのを避ける
      // (PR #945 の webhook 側と同一根拠。sibling /api/webhooks/google-calendar 参照)。
      invalidateSiteWideCacheFromRouteHandler(
        [CACHE_TAGS.RESERVATIONS, getCacheTag.reservations.calendar()],
        { skipCdnPurge: true },
      );

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
