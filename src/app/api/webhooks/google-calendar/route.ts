/**
 * Google Calendar Webhook API
 *
 * Google Calendar APIからのプッシュ通知を受信し、
 * カレンダーの変更をシステムに反映します。
 *
 * ## 機能
 * - プッシュ通知の受信・検証
 * - カレンダー変更の即時同期
 * - チャンネルID/リソースIDの検証
 *
 * @module api/webhooks/google-calendar
 */

import crypto from "node:crypto";
import { unstable_rethrow } from "next/navigation";
import { invalidateSiteWideCacheFromRouteHandler } from "@/shared/lib/cache/site-wide";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { getGoogleCalendarWebhookState } from "@/shared/domain/settings/admin-queries";

/**
 * タイミング攻撃を防止する定時間トークン比較
 * Google Calendar API は HMAC 署名を未サポートのため、
 * 共有秘密トークンの比較にはタイミングセーフな比較が必須。
 */
function timingSafeTokenEqual(
  received: string | undefined,
  expected: string,
): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
import { syncFromCalendar } from "@/shared/lib/calendar-sync/inbound";
import { isTwoWaySyncEnabled } from "@/shared/lib/google-calendar";
import { getTwoWaySyncSettings } from "@/shared/domain/settings/admin-queries";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  jsonError,
  jsonSuccess,
  jsonValidationError,
} from "@/shared/lib/route-responses";
import { googleCalendarWebhookHeadersSchema } from "@/shared/lib/validations/google-calendar-webhook";
import { CalendarSyncMethod } from "@/shared/lib/validations/enums/prisma-types";

function acknowledgeNotification(data: Record<string, unknown> = {}) {
  return jsonSuccess({ acknowledged: true, ...data });
}

/**
 * Google Calendar Push Notification Webhook
 * POST /api/webhooks/google-calendar
 *
 * Google Calendar APIからのプッシュ通知を受信
 * カレンダーに変更があると通知が送られてくる
 *
 * ヘッダー:
 * - X-Goog-Channel-ID: チャンネルID
 * - X-Goog-Resource-ID: リソースID
 * - X-Goog-Resource-State: sync | exists | not_exists
 * - X-Goog-Message-Number: メッセージ番号
 */
export async function POST(request: Request) {
  try {
    const headersResult = googleCalendarWebhookHeadersSchema.safeParse({
      channelId: request.headers.get("x-goog-channel-id") ?? undefined,
      resourceId: request.headers.get("x-goog-resource-id") ?? undefined,
      resourceState: request.headers.get("x-goog-resource-state") ?? undefined,
      resourceUri: request.headers.get("x-goog-resource-uri") ?? undefined,
      channelToken: request.headers.get("x-goog-channel-token") ?? undefined,
      messageNumber: request.headers.get("x-goog-message-number") ?? undefined,
    });

    if (!headersResult.success) {
      logError(new Error("Invalid Google Calendar webhook headers"), {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "googleCalendarWebhook",
          issues: headersResult.error.issues.map((issue) => issue.message),
        },
      });
      return jsonValidationError(headersResult.error, "Invalid request");
    }

    const {
      channelId,
      resourceId,
      resourceState,
      resourceUri,
      channelToken: receivedToken,
    } = headersResult.data;

    // 登録されているWebhookか確認
    const settings = await getGoogleCalendarWebhookState();

    // トークンが設定されていない場合はWebhookを拒否（セキュリティ強化）
    if (!settings.token) {
      logError(new Error("Webhook token not configured"), {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.HIGH,
        context: { operation: "googleCalendarWebhook" },
      });
      return jsonError("Webhook not configured", 503);
    }

    if (!timingSafeTokenEqual(receivedToken, settings.token)) {
      logError(new Error("Invalid webhook token"), {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "googleCalendarWebhook",
          hasToken: !!receivedToken,
        },
      });
      return jsonError("Invalid token", 403);
    }

    if (
      settings.channelId !== channelId ||
      settings.resourceId !== resourceId
    ) {
      logError(new Error("Unknown webhook channel/resource"), {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        context: { operation: "googleCalendarWebhook", channelId, resourceId },
      });
      // Google Calendar は 2xx で配信成功扱いにする。検証済み token の通知は明示的に ack して再送を抑止する。
      return acknowledgeNotification({ ignored: true });
    }

    // X-Goog-Resource-URI の改ざん検証（公式仕様: URI には監視対象の calendar ID が含まれる）
    // 例: https://www.googleapis.com/calendar/v3/calendars/<CALENDAR_ID>/events?...
    if (resourceUri && settings.calendarId) {
      const encodedCalendarId = encodeURIComponent(settings.calendarId);
      const expectedSegment = `/calendars/${encodedCalendarId}/events`;
      const plainSegment = `/calendars/${settings.calendarId}/events`;
      if (
        !resourceUri.includes(expectedSegment) &&
        !resourceUri.includes(plainSegment)
      ) {
        logError(new Error("Webhook resource URI mismatch"), {
          category: ErrorCategory.VALIDATION,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "googleCalendarWebhook",
            resourceUri,
            expectedCalendarId: settings.calendarId,
          },
        });
        // 検証済み token の通知は処理対象外として ack し、Google の再送を抑止する。
        return acknowledgeNotification({ ignored: true });
      }
    }

    // syncイベントは初回登録時の確認なのでスキップ
    if (resourceState === "sync") {
      return acknowledgeNotification({ sync: true });
    }

    // 双方向同期が有効か確認
    const enabled = await isTwoWaySyncEnabled();
    if (!enabled) {
      return acknowledgeNotification({ disabled: true });
    }

    // 同期方式を確認（webhookまたはbothの場合のみ実行）
    const syncSettings = await getTwoWaySyncSettings();
    if (syncSettings.syncMethod === CalendarSyncMethod.polling) {
      return acknowledgeNotification({ pollingOnly: true });
    }

    // 同期実行
    const result = await syncFromCalendar();

    if (!result.success) {
      logError(new Error("Webhook sync failed"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: "googleCalendarWebhook", errors: result.errors },
      });
      // 検証済み通知は ack し、同期の失敗はログと定期同期で回収する。
      return acknowledgeNotification({ processing: "sync_failed" });
    }

    // キャッシュ無効化: カレンダー同期後に予約データを最新化。
    // webhook は Google Calendar 側の変更を反映する経路のため、SWR ではなく
    // `{expire:0}` の blocking immediate-expire を使う（invalidateSiteWideCache-
    // FromRouteHandler 経由。cron / Route Handler 用の canonical pattern）。
    // skipCdnPurge: true — RESERVATIONS + calendar tag は全て admin-only の
    // private tag。CDN 経路に emit されないため SITEMAP co-purge を Cloudflare に
    // 飛ばす意味が無く、webhook 頻度で purge quota を不必要に消費するのを避ける
    // (Codex PR #945 review 対応)。
    invalidateSiteWideCacheFromRouteHandler(
      [CACHE_TAGS.RESERVATIONS, getCacheTag.reservations.calendar()],
      { skipCdnPurge: true },
    );

    return acknowledgeNotification({
      processed: result.processed,
      deleted: result.deleted,
      updated: result.updated,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: "googleCalendarWebhook" },
    });
    // 検証済み通知は ack し、内部例外はログと定期同期で回収する。
    return acknowledgeNotification({ processing: "failed" });
  }
}
