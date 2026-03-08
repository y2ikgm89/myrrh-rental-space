"use server";

/**
 * Google Calendar連携 Server Actions
 *
 * @module admin/actions/settings/google-calendar
 */

import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationError } from "@/shared/lib/action-helpers";
import { checkReadPermissionFor } from "@/admin/lib/permissions";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import {
  getGoogleCalendarSettings as getGoogleCalendarSettingsQuery,
  getGoogleCalendarWebhookState,
} from "@/shared/domain/settings/admin-queries";
import {
  clearGoogleCalendarServiceAccount as clearGoogleCalendarServiceAccountCommand,
  clearGoogleCalendarWebhook,
  disconnectGoogleCalendarOAuth as disconnectGoogleCalendarOAuthCommand,
  enableGoogleCalendarOAuth,
  recordGoogleCalendarConnectionError,
  recordGoogleCalendarConnectionSuccess,
  saveGoogleCalendarWebhook,
  updateGoogleCalendarSettings as updateGoogleCalendarSettingsCommand,
  updateTwoWaySyncSettings as updateTwoWaySyncSettingsCommand,
} from "@/shared/domain/settings/commands";
import { DomainError } from "@/shared/domain/domain-error";
import type { GoogleCalendarSettingsData } from "@/shared/domain/settings/types";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  setupWebhookWatch,
  stopWebhookWatch,
  testOAuthConnection,
  testServiceAccountConnection,
} from "@/shared/lib/google-calendar";
import { syncFromCalendar } from "@/shared/lib/calendar-sync";
import { clientEnv } from "@/shared/lib/env/client";
import { serverEnv } from "@/shared/lib/env/server";

import {
  googleCalendarConnectionTestSchema,
  googleCalendarSettingsSchema,
  twoWaySyncSettingsSchema,
  type GoogleCalendarConnectionTestInput,
  type GoogleCalendarSettingsInput,
  type TwoWaySyncSettingsInput,
} from "./schemas";

const checkReadPermission = checkReadPermissionFor("settings");

function invalidateSettingsCache(): void {
  updateTag(CACHE_TAGS.SETTINGS);
}

function invalidateCalendarSyncCache(): void {
  updateTag(CACHE_TAGS.SETTINGS);
  updateTag(CACHE_TAGS.RESERVATIONS);
}

export async function updateGoogleCalendarSettings(
  data: GoogleCalendarSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = googleCalendarSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateGoogleCalendarSettingsCommand(parsed.data);
    },
    success: () => createSuccess("Google Calendar設定を更新しました"),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function testGoogleCalendarConnectionAction(
  params: GoogleCalendarConnectionTestInput,
): Promise<ActionResult<{ calendarName: string; accountEmail: string }>> {
  const parsed = googleCalendarConnectionTestSchema.safeParse(params);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      const result = await testServiceAccountConnection(parsed.data);
      if (!result.success) {
        try {
          await recordGoogleCalendarConnectionError();
        } catch (error) {
          logError(normalizeError(error), {
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.MEDIUM,
            context: { operation: "testGoogleCalendarConnectionAction:error" },
          });
        }

        throw new DomainError(
          result.error ?? "接続テストに失敗しました",
          "VALIDATION",
        );
      }

      try {
        await recordGoogleCalendarConnectionSuccess();
      } catch (error) {
        logError(normalizeError(error), {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "testGoogleCalendarConnectionAction:success",
          },
        });
      }

      return {
        calendarName: result.calendarName ?? "",
        accountEmail: result.accountEmail ?? "",
      };
    },
    success: (result) => createSuccess("接続テストに成功しました", result),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function testGoogleCalendarOAuthAction(): Promise<
  ActionResult<{ calendarName: string }>
> {
  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async (user) => {
      const result = await testOAuthConnection(user.id);
      if (!result.success) {
        throw new DomainError(
          result.error ?? "OAuth接続テストに失敗しました",
          "VALIDATION",
        );
      }

      await enableGoogleCalendarOAuth();

      return {
        calendarName: result.calendarName ?? "",
      };
    },
    success: (result) =>
      createSuccess("OAuth接続テストに成功しました", result),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function clearGoogleCalendarServiceAccount(): Promise<ActionResult<void>> {
  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await clearGoogleCalendarServiceAccountCommand();
    },
    success: () => createSuccess("サービスアカウント認証情報をクリアしました"),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function disconnectGoogleCalendarOAuth(): Promise<ActionResult<void>> {
  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async (user) => {
      await disconnectGoogleCalendarOAuthCommand(user.id);
    },
    success: () => createSuccess("Google Calendar OAuth連携を解除しました"),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function getGoogleCalendarSettings(): Promise<GoogleCalendarSettingsData | null> {
  if (!(await checkReadPermission())) {
    return null;
  }

  return getGoogleCalendarSettingsQuery();
}

export async function updateTwoWaySyncSettings(
  data: TwoWaySyncSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = twoWaySyncSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateTwoWaySyncSettingsCommand(parsed.data);
    },
    success: () => createSuccess("双方向同期設定を更新しました"),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function setupCalendarWebhook(): Promise<
  ActionResult<{ expiration: Date | undefined }>
> {
  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      const baseUrl = clientEnv.NEXT_PUBLIC_APP_URL ?? serverEnv.BETTER_AUTH_URL;
      if (!baseUrl) {
        throw new DomainError("APP_URLが設定されていません", "VALIDATION");
      }

      const normalizedBaseUrl = baseUrl.startsWith("http")
        ? baseUrl
        : `https://${baseUrl}`;
      const webhookUrl = `${normalizedBaseUrl}/api/webhooks/google-calendar`;

      const result = await setupWebhookWatch(webhookUrl);
      if (!result.success || !result.channelId || !result.resourceId) {
        throw new DomainError(
          result.error ?? "Webhook設定に失敗しました",
          "VALIDATION",
        );
      }

      await saveGoogleCalendarWebhook({
        channelId: result.channelId,
        resourceId: result.resourceId,
        expiration: result.expiration,
      });

      return { expiration: result.expiration };
    },
    success: ({ expiration }) =>
      createSuccess("Webhookを設定しました", { expiration }),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function stopCalendarWebhook(): Promise<ActionResult<void>> {
  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      const webhookState = await getGoogleCalendarWebhookState();
      if (!webhookState.channelId || !webhookState.resourceId) {
        throw new DomainError("Webhookが設定されていません", "VALIDATION");
      }

      const result = await stopWebhookWatch(
        webhookState.channelId,
        webhookState.resourceId,
      );
      if (!result.success) {
        throw new DomainError(
          result.error ?? "Webhook停止に失敗しました",
          "VALIDATION",
        );
      }

      await clearGoogleCalendarWebhook();
    },
    success: () => createSuccess("Webhookを停止しました"),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function triggerManualSync(): Promise<
  ActionResult<{
    processed: number;
    deleted: number;
    updated: number;
    errors: string[];
  }>
> {
  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      const result = await syncFromCalendar();
      if (!result.success) {
        throw new DomainError(
          result.errors[0] ?? "同期に失敗しました",
          "UNEXPECTED",
        );
      }

      return {
        processed: result.processed,
        deleted: result.deleted,
        updated: result.updated,
        errors: result.errors,
      };
    },
    success: (result) => createSuccess("同期が完了しました", result),
    afterSuccess: invalidateCalendarSyncCache,
  });
}
