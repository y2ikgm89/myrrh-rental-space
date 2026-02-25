import "server-only";

import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { prisma } from "@/shared/lib/prisma";
import { serverEnv } from "@/shared/lib/env/server";
import { clientEnv } from "@/shared/lib/env/client";
import { CalendarSyncMethod } from "@/shared/generated/prisma/enums";
import type { WebhookSetupResult, WebhookRenewalResult } from "./types";
import { formatGoogleApiError } from "./helpers";
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

  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { googleCalendarId: true },
  });

  if (!settings?.googleCalendarId) {
    return { success: false, error: "Calendar ID is not configured" };
  }

  try {
    const channelId = crypto.randomUUID();
    const webhookToken = crypto.randomUUID(); // 認証用トークン
    const expiration = new Date();
    expiration.setDate(expiration.getDate() + 7); // 7日間有効（最大）

    const response = await client.events.watch({
      calendarId: settings.googleCalendarId,
      requestBody: {
        id: channelId,
        type: "web_hook",
        address: webhookUrl,
        token: webhookToken, // x-goog-channel-token として送信される
        expiration: String(expiration.getTime()),
      },
    });

    // トークンをDBに保存
    await prisma.settings.update({
      where: { id: "singleton" },
      data: { googleCalendarWebhookToken: webhookToken },
    });

    return {
      success: true,
      channelId: response.data.id ?? undefined,
      resourceId: response.data.resourceId ?? undefined,
      expiration: response.data.expiration
        ? new Date(parseInt(response.data.expiration))
        : undefined,
    };
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
    await client.channels.stop({
      requestBody: {
        id: channelId,
        resourceId,
      },
    });

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
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      googleCalendarWebhookExpiration: true,
      googleCalendarWebhookChannelId: true,
      googleCalendarWebhookResourceId: true,
      googleCalendarSyncMethod: true,
    },
  });

  // Webhookが設定されていない場合はスキップ
  if (!settings?.googleCalendarWebhookExpiration) {
    return { success: true, renewed: false };
  }

  // Webhook方式でない場合はスキップ
  if (
    settings.googleCalendarSyncMethod !== CalendarSyncMethod.webhook &&
    settings.googleCalendarSyncMethod !== CalendarSyncMethod.both
  ) {
    return { success: true, renewed: false };
  }

  // 2日前判定
  const now = new Date();
  const threshold = new Date(now);
  threshold.setDate(threshold.getDate() + WEBHOOK_RENEWAL_THRESHOLD_DAYS);

  if (settings.googleCalendarWebhookExpiration > threshold) {
    // まだ更新不要
    return { success: true, renewed: false };
  }

  try {
    // 既存Webhookを停止（エラーは無視 - Google側で自動期限切れになる）
    if (
      settings.googleCalendarWebhookChannelId &&
      settings.googleCalendarWebhookResourceId
    ) {
      await stopWebhookWatch(
        settings.googleCalendarWebhookChannelId,
        settings.googleCalendarWebhookResourceId,
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
      return { success: false, renewed: false, error: result.error };
    }

    // 設定を更新
    await prisma.settings.update({
      where: { id: "singleton" },
      data: {
        googleCalendarWebhookChannelId: result.channelId,
        googleCalendarWebhookResourceId: result.resourceId,
        googleCalendarWebhookExpiration: result.expiration,
      },
    });

    return {
      success: true,
      renewed: true,
      newExpiration: result.expiration,
    };
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
