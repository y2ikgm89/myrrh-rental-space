"use server";

/**
 * Google Calendar連携 Server Actions
 *
 * @module admin/actions/settings/google-calendar
 */

import type { SubmissionResult } from "@conform-to/react";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
// CACHE-DRIFT-SETTLE: INTEGRATION_SETTINGS は NEXTJS_TAG_TO_CDN_TAG 上「type-cleanliness
// のためだけの mapping」で、実 surface は admin-only (private,no-store)。RESERVATIONS は
// NEXTJS_TAGS_WITHOUT_CDN_MAPPING allowlist の admin-only tag。いずれも CDN 経路には
// 露出しないため skipCdnPurge:true。helper 経由で local/no-raw-updatetag-for-cdn-mapped-
// cache-tag drift gate を通過させる。
import { invalidateSiteWideCache } from "@/shared/lib/cache/site-wide";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  getGoogleCalendarServiceAccountConfig,
  getGoogleCalendarSettings,
  getGoogleCalendarWebhookState,
} from "@/shared/domain/settings/admin-queries";
import { getServiceAccountClient } from "@/shared/domain/settings/google-calendar";
import {
  clearGoogleCalendarServiceAccount as clearGoogleCalendarServiceAccountCommand,
  clearGoogleCalendarWebhook,
  saveGoogleCalendarWebhook,
  updateEventImportEnabled,
  updateGoogleCalendarSettings as updateGoogleCalendarSettingsCommand,
  updateTwoWaySyncSettings as updateTwoWaySyncSettingsCommand,
} from "@/shared/domain/settings/google-calendar-commands";
import { DomainError } from "@/shared/domain/domain-error";
import { recordConnectionTestResult } from "@/shared/domain/settings/connection-health";
import { IntegrationKey } from "@/shared/lib/validations/enums/prisma-types";
import { safeDecryptToString } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import {
  isValidCalendarId,
  setupWebhookWatch,
  stopWebhookWatch,
  testServiceAccountConnection,
} from "@/shared/lib/google-calendar";
import { syncFromCalendar } from "@/shared/domain/reservations/reservation-calendar-inbound";
import {
  releaseCalendarSyncLock,
  tryAcquireCalendarSyncLock,
} from "@/shared/domain/calendar-sync/locks";
import { clientEnv } from "@/shared/lib/env/client";
import { serverEnv } from "@/shared/lib/env/server";
import type { MutationResult } from "@/shared/lib/mutation-result";

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
        afterSuccess: () => {
          // icalAttachmentEnabled / addToCalendarLinksEnabled は
          // getCalendarEmailSettings が NOTIFICATION_SETTINGS + STATIC_SETTINGS
          // ("days") で読む。INTEGRATION_SETTINGS だけだとメール・完了ページの
          // .ics / カレンダー追加リンクが stale のまま残る (F-95)。
          updateTag(CACHE_TAGS.NOTIFICATION_SETTINGS);
          invalidateSiteWideCache(CACHE_TAGS.INTEGRATION_SETTINGS, {
            skipCdnPurge: true,
          });
        },
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

export async function testGoogleCalendarConnectionAction(): Promise<
  MutationResult<{ calendarName: string; accountEmail: string }>
> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      const [settings, serviceAccount] = await Promise.all([
        getGoogleCalendarSettings(),
        getGoogleCalendarServiceAccountConfig(),
      ]);
      const serviceAccountJson = serviceAccount.encryptedServiceAccountJson
        ? safeDecryptToString(serviceAccount.encryptedServiceAccountJson, {
            expectedPurpose:
              SETTINGS_CRYPTO_PURPOSES.googleCalendarServiceAccount,
          })
        : null;
      if (
        !settings.calendarId ||
        !serviceAccountJson ||
        !isValidCalendarId(settings.calendarId)
      ) {
        throw new DomainError("先に保存してください", "VALIDATION");
      }

      const result = await testServiceAccountConnection({
        serviceAccountJson,
        calendarId: settings.calendarId,
      });
      await recordConnectionTestResult(IntegrationKey.GOOGLE_CALENDAR, result);
      if (!result.success) {
        throw new DomainError(
          result.error ?? "接続テストに失敗しました",
          "VALIDATION",
        );
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

      const client = await getServiceAccountClient();
      if (!client) {
        throw new DomainError(
          "Google Calendarが設定されていません",
          "VALIDATION",
        );
      }

      const webhookState = await getGoogleCalendarWebhookState();
      const result = await setupWebhookWatch(client, webhookState, webhookUrl);
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

      const client = await getServiceAccountClient();
      if (!client) {
        throw new DomainError(
          "Google Calendarが設定されていません",
          "VALIDATION",
        );
      }

      const result = await stopWebhookWatch(
        client,
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

/**
 * 設定画面の「手動同期」。
 *
 * **cron / webhook と同じ排他ロックを取る（監査 A-03）。** 以前はここだけロックを
 * 取らずに `syncFromCalendar()` を直接呼んでいた。`syncFromCalendar` は
 * 同期トークンを読んで進める（`fetchCalendarChanges(syncToken)` →
 * `saveCalendarSyncToken(newSyncToken)`）ため、cron / webhook と重なると
 * webhook route が名指しで警戒しているトークンの lost update が起きる。
 * さらに `processCalendarChange` は時間変更に対して SwitchBot パスコードの
 * revoke → 再発行を伴うので、二重実行は発行済みパスコードの誤失効になりうる。
 *
 * 唯一の防御だった `SYNC_MIN_INTERVAL_SECONDS`（10 秒）は効かない:
 * `recordCalendarSyncCompleted()` は全処理成功後にしか打たれない（GCAL-AUDIT-09、
 * 失敗直後の即時リトライを塞がないための意図的な設計）ので、**実行中の run は
 * lastSyncedAt を更新しておらず throttle を素通りさせる**。
 */
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
      const acquired = await tryAcquireCalendarSyncLock();
      if (!acquired) {
        throw new DomainError(
          "他の同期が実行中です。しばらく待ってから再試行してください。",
          "CONFLICT",
        );
      }

      try {
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
      } finally {
        await releaseCalendarSyncLock();
      }
    },
    afterSuccess: invalidateCalendarSyncCache,
  });
}
