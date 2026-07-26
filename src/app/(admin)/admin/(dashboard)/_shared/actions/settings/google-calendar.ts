"use server";

/**
 * Google Calendar連携 Server Actions
 *
 * @module admin/actions/settings/google-calendar
 */

import type { SubmissionResult } from "@conform-to/react";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
// CACHE-DRIFT-SETTLE: INTEGRATION_SETTINGS は NEXTJS_TAG_TO_CDN_TAG 上「type-cleanliness
// のためだけの mapping」で、実 surface は admin-only (private,no-store)。RESERVATIONS は
// NEXTJS_TAGS_WITHOUT_CDN_MAPPING allowlist の admin-only tag。いずれも CDN 経路には
// 露出しないため skipCdnPurge:true。helper 経由で local/no-raw-updatetag-for-cdn-mapped-
// cache-tag drift gate を通過させる。
import { invalidateSiteWideCache } from "@/shared/lib/cache/site-wide";
import { isMutationError } from "@/shared/lib/mutation-result";
import { getGoogleCalendarWebhookState } from "@/shared/domain/settings/admin-queries";
import { updateEventImportEnabled } from "@/shared/domain/settings/commands";
import {
  clearGoogleCalendarServiceAccount as clearGoogleCalendarServiceAccountCommand,
  clearGoogleCalendarWebhook,
  recordGoogleCalendarConnectionError,
  recordGoogleCalendarConnectionSuccess,
  saveGoogleCalendarWebhook,
  updateGoogleCalendarSettings as updateGoogleCalendarSettingsCommand,
  updateTwoWaySyncSettings as updateTwoWaySyncSettingsCommand,
} from "@/shared/domain/settings/integration-commands";
import { DomainError } from "@/shared/domain/domain-error";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  setupWebhookWatch,
  stopWebhookWatch,
  testServiceAccountConnection,
} from "@/shared/lib/google-calendar";
import { syncFromCalendar } from "@/shared/lib/calendar-sync/inbound";
import { clientEnv } from "@/shared/lib/env/client";
import { serverEnv } from "@/shared/lib/env/server";
import type { MutationResult } from "@/shared/lib/mutation-result";

import {
  googleCalendarConnectionTestSchema,
  type GoogleCalendarConnectionTestInput,
} from "./schemas";
import {
  googleCalendarFormSchema,
  twoWaySyncFormSchema,
} from "./schemas/form-schemas-security-integrations";
import { emptyToNull } from "./schemas/form-schema-helpers";

function invalidateCalendarSyncCache(): void {
  invalidateSiteWideCache(
    [CACHE_TAGS.INTEGRATION_SETTINGS, CACHE_TAGS.RESERVATIONS],
    { skipCdnPurge: true },
  );
}

function refreshIntegrationSettings(): void {
  invalidateSiteWideCache(CACHE_TAGS.INTEGRATION_SETTINGS, {
    skipCdnPurge: true,
  });
}

/**
 * Google Calendar 設定更新 — conform `useActionState` 統合経路。
 *
 * 空文字列フィールドは null 化して domain command に渡す。
 */
export async function updateGoogleCalendarSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    googleCalendarFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "settings",
        action: "manage",
        execute: async () => {
          await updateGoogleCalendarSettingsCommand({
            googleCalendarEnabled: data.googleCalendarEnabled,
            googleCalendarId: emptyToNull(data.googleCalendarId),
            serviceAccountJson: emptyToNull(data.serviceAccountJson),
            icalAttachmentEnabled: data.icalAttachmentEnabled,
            addToCalendarLinksEnabled: data.addToCalendarLinksEnabled,
            googleCalendarReminderMinutes:
              data.googleCalendarReminderMinutes ?? null,
          });
          return null;
        },
        afterSuccess: refreshIntegrationSettings,
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

export async function testGoogleCalendarConnectionAction(
  params: GoogleCalendarConnectionTestInput,
): Promise<MutationResult<{ calendarName: string; accountEmail: string }>> {
  const parsed = googleCalendarConnectionTestSchema.safeParse(params);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
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
    afterSuccess: refreshIntegrationSettings,
  });
}

export async function clearGoogleCalendarServiceAccount(): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      await clearGoogleCalendarServiceAccountCommand();
      return null;
    },
    afterSuccess: refreshIntegrationSettings,
  });
}

/**
 * 双方向同期設定更新 — conform `useActionState` 統合経路。
 *
 */
export async function updateTwoWaySyncSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    twoWaySyncFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "settings",
        action: "manage",
        execute: async () => {
          await updateTwoWaySyncSettingsCommand(data);
          return null;
        },
        afterSuccess: refreshIntegrationSettings,
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

export async function setupCalendarWebhook(): Promise<
  MutationResult<{ expiration: Date | undefined }>
> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      const baseUrl =
        clientEnv.NEXT_PUBLIC_APP_URL ?? serverEnv.BETTER_AUTH_URL;
      if (!baseUrl) {
        throw new DomainError("APP_URLが設定されていません", "VALIDATION");
      }

      const normalizedBaseUrl = baseUrl.startsWith("http")
        ? baseUrl
        : `https://${baseUrl}`;
      const webhookUrl = `${normalizedBaseUrl}/api/webhooks/google-calendar`;

      const result = await setupWebhookWatch(webhookUrl);
      if (
        !result.success ||
        !result.channelId ||
        !result.resourceId ||
        !result.token
      ) {
        throw new DomainError(
          result.error ?? "Webhook設定に失敗しました",
          "VALIDATION",
        );
      }

      await saveGoogleCalendarWebhook({
        channelId: result.channelId,
        resourceId: result.resourceId,
        expiration: result.expiration,
        token: result.token,
      });

      return { expiration: result.expiration };
    },
    afterSuccess: refreshIntegrationSettings,
  });
}

export async function stopCalendarWebhook(): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
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
      return null;
    },
    afterSuccess: refreshIntegrationSettings,
  });
}

export async function toggleEventImport(
  enabled: boolean,
): Promise<MutationResult<null>> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      await updateEventImportEnabled(enabled);
      return null;
    },
    afterSuccess: refreshIntegrationSettings,
  });
}

export async function triggerManualSync(): Promise<
  MutationResult<{
    processed: number;
    deleted: number;
    updated: number;
    errors: string[];
  }>
> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
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
    afterSuccess: invalidateCalendarSyncCache,
  });
}
