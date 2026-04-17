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
import {
  saveGoogleCalendarWebhook,
  saveGoogleCalendarWebhookToken,
} from "@/shared/domain/settings/commands";
import { serverEnv } from "@/shared/lib/env/server";
import { clientEnv } from "@/shared/lib/env/client";
import { CalendarSyncMethod } from "@/shared/lib/validations/enums/prisma-types";
import { omitUndefined } from "@/shared/lib/serialize";
import type { WebhookSetupResult, WebhookRenewalResult } from "./types";
import { formatGoogleApiError } from "./helpers";
import { withGoogleApiRetry } from "./retry";
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

    await saveGoogleCalendarWebhookToken(webhookToken);

    return omitUndefined({
      success: true,
      channelId: registeredChannelId,
      resourceId: registeredResourceId,
      expiration: response.data.expiration
        ? new Date(parseInt(response.data.expiration))
        : undefined,
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
): Promise<{ success: boolean; error?: string }> {
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

  // 2日前判定
  const now = new Date();
  const threshold = new Date(now);
  threshold.setDate(threshold.getDate() + WEBHOOK_RENEWAL_THRESHOLD_DAYS);

  if (webhookState.expiration > threshold) {
    // まだ更新不要
    return { success: true, renewed: false };
  }

  try {
    // 既存Webhookを停止（エラーは無視 - Google側で自動期限切れになる）
    if (webhookState.channelId && webhookState.resourceId) {
      await stopWebhookWatch(
        webhookState.channelId,
        webhookState.resourceId,
      ).catch((err: unknown) => {
        logError(normalizeError(err), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.LOW,
          context: {
            operation: "renewWebhookIfNeeded",
            note: "old webhook stop failed (will expire automatically)",
          },
        });
      });
    }

    // 新しいWebhookを設定
    const baseUrl = clientEnv.NEXT_PUBLIC_APP_URL ?? serverEnv.BETTER_AUTH_URL;
    if (!baseUrl) {
      return {
        success: false,
        renewed: false,
        error: "APP_URL not configured",
      };
    }

    const webhookUrl = `${baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`}/api/webhooks/google-calendar`;
    const result = await setupWebhookWatch(webhookUrl);

    if (!result.success) {
      return omitUndefined({
        success: false,
        renewed: false,
        error: result.error,
      });
    }

    if (!result.channelId || !result.resourceId) {
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
