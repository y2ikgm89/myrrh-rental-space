"use server";

import type { SubmissionResult } from "@conform-to/react";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  testGoogleMapsConnection,
  testResendConnection,
  testSwitchBotConnection,
  testTurnstileConnection,
} from "@/admin/lib/api-keys";
import {
  resendFormSchema,
  googleMapsFormSchema,
  switchbotFormSchema,
  turnstileFormSchema,
} from "@/admin/actions/settings/schemas/form-schemas-security-integrations";
import { emptyToNull } from "@/admin/actions/settings/schemas/form-schema-helpers";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  clearGoogleMapsSettings as clearGoogleMapsSettingsCommand,
  clearResendSettings as clearResendSettingsCommand,
  clearSwitchBotSettings as clearSwitchBotSettingsCommand,
  clearTurnstileSettings as clearTurnstileSettingsCommand,
  ensureSwitchBotWebhookPathToken,
  getSwitchBotWebhookRegistrationStatus,
  recordGoogleMapsConnectionStatus,
  recordResendConnectionStatus,
  recordSwitchBotConnectionStatus,
  recordTurnstileConnectionStatus,
  rotateSwitchBotWebhookPathToken as rotateSwitchBotWebhookPathTokenCommand,
  updateGoogleMapsSettings as updateGoogleMapsSettingsCommand,
  updateResendSettings as updateResendSettingsCommand,
  updateSwitchBotSettings as updateSwitchBotSettingsCommand,
  updateTurnstileSettings as updateTurnstileSettingsCommand,
  type SwitchBotWebhookRegistrationStatus,
} from "@/shared/domain/settings/api-key-commands";
import {
  getDecryptedGoogleMapsApiKey,
  getDecryptedResendApiKey,
  getDecryptedSwitchBotCredentials,
  getDecryptedSwitchBotCredentialsForRevocation,
  getDecryptedTurnstileSecretKey,
  getTurnstileSiteKeyUncached,
} from "@/shared/domain/settings/api-key-queries";
import { setupWebhook } from "@/shared/lib/smart-lock/switchbot-client";
import { DomainError } from "@/shared/domain/domain-error";
// CACHE-DRIFT-SETTLE: INTEGRATION_SETTINGS は NEXTJS_TAG_TO_CDN_TAG 上「type-cleanliness
// のためだけの mapping」で、実 surface は admin-only (private,no-store)。CDN 経路には
// 露出しないため skipCdnPurge:true。helper 経由で local/no-raw-updatetag-for-cdn-mapped-
// cache-tag drift gate を通過させる。
import { invalidateSiteWideCache } from "@/shared/lib/cache/site-wide";
import { CACHE_TAGS, getAppUrl } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { ConnectionStatus } from "@/shared/lib/validations/enums/prisma-types";

function refreshSettingsCache(): void {
  invalidateSiteWideCache(CACHE_TAGS.INTEGRATION_SETTINGS, {
    skipCdnPurge: true,
  });
}

/**
 * Resend 設定更新 — conform `useActionState` 統合経路。
 *
 * `useActionState` + `useForm` (conform) に clean break 移行。
 * 空文字は domain command 渡し前に null 化（クリア operation は `clearResendKeys`
 * を使うが、空フィールド送信で実質クリアにならないよう "" → null 変換のみ）。
 */
export async function updateResendSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, resendFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "settings",
      action: "manage",
      execute: async () => {
        await updateResendSettingsCommand({
          resendApiKey: emptyToNull(data.resendApiKey),
          resendWebhookSecret: emptyToNull(data.resendWebhookSecret),
        });
        return null;
      },
      afterSuccess: refreshSettingsCache,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

export async function testResendConnectionAction(): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      const apiKey = await getDecryptedResendApiKey();
      if (!apiKey) {
        throw new DomainError("先に保存してください", "VALIDATION");
      }

      const result = await testResendConnection(apiKey);
      await recordResendConnectionStatus(
        result.success ? ConnectionStatus.CONNECTED : ConnectionStatus.ERROR,
      );
      refreshSettingsCache();

      if (!result.success) {
        throw new DomainError(
          result.error || "接続テストに失敗しました",
          "VALIDATION",
        );
      }

      return null;
    },
  });
}

export async function clearResendKeys(): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      await clearResendSettingsCommand();
      return null;
    },
    afterSuccess: refreshSettingsCache,
  });
}

/**
 * Turnstile 設定更新 — conform `useActionState` 統合経路。
 *
 * `useActionState` + `useForm` (conform) に clean break 移行。
 */
export async function updateTurnstileSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, turnstileFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "settings",
      action: "manage",
      execute: async () => {
        await updateTurnstileSettingsCommand({
          turnstileSiteKey: emptyToNull(data.turnstileSiteKey),
          turnstileSecretKey: emptyToNull(data.turnstileSecretKey),
        });
        return null;
      },
      afterSuccess: refreshSettingsCache,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

export async function testTurnstileConnectionAction(): Promise<
  MutationResult<{ note?: string }>
> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      const [siteKey, secretKey] = await Promise.all([
        getTurnstileSiteKeyUncached(),
        getDecryptedTurnstileSecretKey(),
      ]);
      if (!siteKey || !secretKey) {
        throw new DomainError("先に保存してください", "VALIDATION");
      }

      const result = testTurnstileConnection(siteKey, secretKey);
      await recordTurnstileConnectionStatus(
        result.success ? ConnectionStatus.CONNECTED : ConnectionStatus.ERROR,
      );
      refreshSettingsCache();

      if (!result.success) {
        throw new DomainError(
          result.error || "接続テストに失敗しました",
          "VALIDATION",
        );
      }

      return omitUndefined({
        note:
          typeof result.metadata?.["note"] === "string"
            ? result.metadata["note"]
            : undefined,
      });
    },
  });
}

export async function clearTurnstileKeys(): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      await clearTurnstileSettingsCommand();
      return null;
    },
    afterSuccess: refreshSettingsCache,
  });
}

/**
 * Google Maps 設定更新 — conform `useActionState` 統合経路。
 *
 * `useActionState` + `useForm` (conform) に clean break 移行。
 */
export async function updateGoogleMapsSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    googleMapsFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "settings",
        action: "manage",
        execute: async () => {
          await updateGoogleMapsSettingsCommand({
            googleMapsApiKey: emptyToNull(data.googleMapsApiKey),
          });
          return null;
        },
        afterSuccess: refreshSettingsCache,
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

export async function testGoogleMapsConnectionAction(): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      const apiKey = await getDecryptedGoogleMapsApiKey();
      if (!apiKey) {
        throw new DomainError("先に保存してください", "VALIDATION");
      }

      const result = await testGoogleMapsConnection(apiKey);
      await recordGoogleMapsConnectionStatus(
        result.success ? ConnectionStatus.CONNECTED : ConnectionStatus.ERROR,
      );
      refreshSettingsCache();

      if (!result.success) {
        throw new DomainError(
          result.error || "接続テストに失敗しました",
          "VALIDATION",
        );
      }

      return null;
    },
  });
}

export async function clearGoogleMapsKeys(): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      await clearGoogleMapsSettingsCommand();
      return null;
    },
    afterSuccess: refreshSettingsCache,
  });
}

/**
 * SwitchBot 設定更新 — conform `useActionState` 統合経路。
 *
 * `useActionState` + `useForm` (conform) に clean break 移行。
 */
export async function updateSwitchBotSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, switchbotFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "settings",
      action: "manage",
      execute: async () => {
        await updateSwitchBotSettingsCommand({
          switchbotEnabled: data.switchbotEnabled,
          switchbotOpenToken: emptyToNull(data.switchbotOpenToken),
          switchbotSecretKey: emptyToNull(data.switchbotSecretKey),
          switchbotPasscodeBufferMinutes: data.switchbotPasscodeBufferMinutes,
        });
        return null;
      },
      afterSuccess: refreshSettingsCache,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

export async function testSwitchBotConnectionAction(): Promise<
  MutationResult<{ note?: string }>
> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      const credentials = await getDecryptedSwitchBotCredentialsForRevocation();
      if (!credentials) {
        throw new DomainError("先に保存してください", "VALIDATION");
      }

      const result = await testSwitchBotConnection(
        credentials.openToken,
        credentials.secretKey,
      );
      await recordSwitchBotConnectionStatus(
        result.success ? ConnectionStatus.CONNECTED : ConnectionStatus.ERROR,
      );
      refreshSettingsCache();

      if (!result.success) {
        throw new DomainError(
          result.error || "接続テストに失敗しました",
          "VALIDATION",
        );
      }

      const deviceCount = result.metadata?.["deviceCount"];
      return omitUndefined({
        note:
          typeof deviceCount === "number"
            ? `${deviceCount}台のデバイスが見つかりました`
            : undefined,
      });
    },
  });
}

export async function clearSwitchBotKeys(): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      await clearSwitchBotSettingsCommand();
      return null;
    },
    afterSuccess: refreshSettingsCache,
  });
}

/**
 * SwitchBot Webhook URLを（未発行なら生成の上）SwitchBot側に登録する。
 * inbound webhookの署名検証機構が公式に無いため、URLパスの難読化トークンで代替する。
 */
export async function registerSwitchBotWebhookAction(): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      const credentials = await getDecryptedSwitchBotCredentials();
      if (!credentials) {
        throw new DomainError(
          "SwitchBot連携が未設定です。先にOpen Token/Secret Keyを保存してください",
          "VALIDATION",
        );
      }

      const token = await ensureSwitchBotWebhookPathToken();
      const url = `${getAppUrl()}/api/webhooks/switchbot/${token}`;

      const result = await setupWebhook(credentials, url);
      if (!result.ok) {
        throw new DomainError(
          `Webhook登録に失敗しました: ${result.message}`,
          "UNEXPECTED",
        );
      }

      return null;
    },
  });
}

export async function checkSwitchBotWebhookRegistrationAction(): Promise<
  MutationResult<{ status: SwitchBotWebhookRegistrationStatus }>
> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      const status = await getSwitchBotWebhookRegistrationStatus();
      return { status };
    },
  });
}

export async function rotateSwitchBotWebhookPathTokenAction(): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      await rotateSwitchBotWebhookPathTokenCommand();
      return null;
    },
    afterSuccess: refreshSettingsCache,
  });
}
