import "server-only";

import type { calendar_v3 } from "googleapis";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { omitUndefined } from "@/shared/lib/serialize";
import type { WebhookSetupResult } from "./types";
import { formatGoogleApiError } from "./helpers";
import { withGoogleApiRetry } from "@/shared/lib/google-api/retry";

export type GoogleCalendarWebhookWatchState = {
  calendarId: string | null;
  channelId: string | null;
  resourceId: string | null;
};

/**
 * Webhook (Push Notifications) を設定する（純粋 API 層）。
 *
 * Settings の読取・永続化は呼び出し側（domain / admin action）が担当する。
 */
export async function setupWebhookWatch(
  client: calendar_v3.Calendar,
  state: GoogleCalendarWebhookWatchState,
  webhookUrl: string,
): Promise<WebhookSetupResult> {
  if (!state.calendarId) {
    return { success: false, error: "Calendar ID is not configured" };
  }

  try {
    if (state.channelId && state.resourceId) {
      await stopWebhookWatch(client, state.channelId, state.resourceId).catch(
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

    const calendarId = state.calendarId;
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
 * Webhook (Push Notifications) を停止する（純粋 API 層）。
 */
export async function stopWebhookWatch(
  client: calendar_v3.Calendar,
  channelId: string,
  resourceId: string,
): Promise<{ success: true } | { success: false; error: string }> {
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
