import "server-only";

import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  getGoogleCalendarWebhookState,
  getTwoWaySyncSettings,
} from "@/shared/domain/settings/admin-queries";
import { saveGoogleCalendarWebhook } from "@/shared/domain/settings/integration-commands";
import { getAppUrl } from "@/shared/lib/constants";
import { CalendarSyncMethod } from "@/shared/lib/validations/enums/prisma-types";
import { omitUndefined } from "@/shared/lib/serialize";
import type { WebhookSetupResult, WebhookRenewalResult } from "./types";
import { formatGoogleApiError } from "./helpers";
import { withGoogleApiRetry } from "@/shared/lib/google-api/retry";
import { getServiceAccountClient } from "./service-account";

const WEBHOOK_RENEWAL_THRESHOLD_DAYS = 2;

/**
 * Webhook (Push Notifications) を設定
 */
export async function setupWebhookWatch(
  webhookUrl: string,
): Promise<WebhookSetupResult> {
  const client = await getServiceAccountClient();
  if (!client) {
    return { success: false, error: "Google Calendar is not configured" };
  }

  const settings = await getGoogleCalendarWebhookState();

  if (!settings.calendarId) {
    return { success: false, error: "Calendar ID is not configured" };
  }

  try {
    if (settings.channelId && settings.resourceId) {
      await stopWebhookWatch(settings.channelId, settings.resourceId).catch(
        (err: unknown) => {
          logError(normalizeError(err), {
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.LOW,
            context: {
              operation: "setupWebhookWatch",
              note: "old webhook stop failed (will expire automatically)",
            },
          });
        },
      );
    }

    const channelId = crypto.randomUUID();
    const webhookToken = crypto.randomUUID(); // 認証用トークン
    const expiration = new Date();
    expiration.setDate(expiration.getDate() + 7); // 7日間有効（最大）

    const calendarId = settings.calendarId;
    const response = await withGoogleApiRetry(() =>
      client.events.watch({
        calendarId,
        requestBody: {
          id: channelId,
          type: "web_hook",
          address: webhookUrl,
          token: webhookToken, // x-goog-channel-token として送信される
          expiration: String(expiration.getTime()),
        },
      }),
    );

    const registeredChannelId = response.data.id ?? undefined;
    const registeredResourceId = response.data.resourceId ?? undefined;
    if (!registeredChannelId || !registeredResourceId) {
      return {
        success: false,
        error: "Google Calendar webhook response is invalid",
      };
    }

    return omitUndefined({
      success: true,
      channelId: registeredChannelId,
      resourceId: registeredResourceId,
      expiration: response.data.expiration
        ? new Date(parseInt(response.data.expiration))
        : undefined,
      token: webhookToken,
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "setupWebhookWatch", webhookUrl },
    });
    return {
      success: false,
      error: formatGoogleApiError(error),
    };
  }
}

/**
 * Webhook (Push Notifications) を停止
 */
export async function stopWebhookWatch(
  channelId: string,
  resourceId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const client = await getServiceAccountClient();
  if (!client) {
    return { success: false, error: "Google Calendar is not configured" };
  }

  try {
    await withGoogleApiRetry(() =>
      client.channels.stop({
        requestBody: {
          id: channelId,
          resourceId,
        },
      }),
    );

    return { success: true };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "stopWebhookWatch", channelId, resourceId },
    });
    return {
      success: false,
      error: formatGoogleApiError(error),
    };
  }
}

/**
 * Webhookの自動更新チェック
 *
 * 有効期限の2日前になったら自動的に更新
 * 既存のWebhookを停止し、新しいWebhookを設定
 */
export async function renewWebhookIfNeeded(): Promise<WebhookRenewalResult> {
  const [webhookState, syncSettings] = await Promise.all([
    getGoogleCalendarWebhookState(),
    getTwoWaySyncSettings(),
  ]);

  // Webhookが設定されていない場合はスキップ
  if (!webhookState.expiration) {
    return { success: true, renewed: false };
  }

  // Webhook方式でない場合はスキップ
  if (
    syncSettings.syncMethod !== CalendarSyncMethod.webhook &&
    syncSettings.syncMethod !== CalendarSyncMethod.both
  ) {
    return { success: true, renewed: false };
  }

  // 認証トークン復号失敗（レガシー平文 / kid 不一致 / 破損）の場合は強制再登録する。
  // getGoogleCalendarWebhookState は復号失敗時に token を null にして返すため、
  // channelId は残っているのに token が null という状態はこの状況を意味する。
  // route.ts の !settings.token 分岐で webhook 到達も 503 で拒否されているため、
  // 期限を待たず即座に clear + 再登録して encrypt-at-rest ciphertext を書き直す。
  const tokenNeedsReregistration =
    !!webhookState.channelId && webhookState.token === null;

  if (!tokenNeedsReregistration) {
    // 2日前判定
    const now = new Date();
    const threshold = new Date(now);
    threshold.setDate(threshold.getDate() + WEBHOOK_RENEWAL_THRESHOLD_DAYS);

    if (webhookState.expiration > threshold) {
      // まだ更新不要
      return { success: true, renewed: false };
    }
  }

  try {
    // 旧 channel 停止は `setupWebhookWatch` 内に集約（best-effort）。
    // token 復号失敗の強制再登録も、watch 成功後の原子 save で
    // token+channel+expiration を一括置換する（事前 clear は不要）。
    const baseUrl = getAppUrl();
    const webhookUrl = `${baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`}/api/webhooks/google-calendar`;
    const result = await setupWebhookWatch(webhookUrl);

    if (!result.success) {
      return omitUndefined({
        success: false,
        renewed: false,
        error: result.error,
      });
    }

    if (!result.channelId || !result.resourceId || !result.token) {
      return {
        success: false,
        renewed: false,
        error: "Google Calendar webhook response is invalid",
      };
    }

    await saveGoogleCalendarWebhook({
      channelId: result.channelId,
      resourceId: result.resourceId,
      expiration: result.expiration,
      token: result.token,
    });

    return omitUndefined({
      success: true,
      renewed: true,
      newExpiration: result.expiration,
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "renewWebhookIfNeeded" },
    });
    return {
      success: false,
      renewed: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
