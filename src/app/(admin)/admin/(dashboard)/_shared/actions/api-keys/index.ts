"use server";

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  testGoogleMapsConnection,
  testResendConnection,
  testTurnstileConnection,
} from "@/admin/lib/api-keys";
import {
  customApiKeySchema,
  type CustomApiKeyInput,
} from "@/admin/lib/validations/api-keys";
import {
  resendFormSchema,
  googleMapsFormSchema,
  turnstileFormSchema,
} from "@/admin/actions/settings/schemas/form-schemas-security-integrations";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  addCustomApiKey as addCustomApiKeyCommand,
  clearGoogleMapsSettings as clearGoogleMapsSettingsCommand,
  clearResendSettings as clearResendSettingsCommand,
  clearTurnstileSettings as clearTurnstileSettingsCommand,
  deleteCustomApiKey as deleteCustomApiKeyCommand,
  recordGoogleMapsConnectionStatus,
  recordResendConnectionStatus,
  recordTurnstileConnectionStatus,
  updateGoogleMapsSettings as updateGoogleMapsSettingsCommand,
  updateResendSettings as updateResendSettingsCommand,
  updateTurnstileSettings as updateTurnstileSettingsCommand,
} from "@/shared/domain/settings/api-key-commands";
import { DomainError } from "@/shared/domain/domain-error";
import { CACHE_TAGS } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";

const apiKeyIdSchema = z.string().min(1, { error: "APIキーIDが不正です" });

function refreshSettingsCache(): void {
  updateTag(CACHE_TAGS.INTEGRATION_SETTINGS);
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
      action: "update",
      execute: async () => {
        await updateResendSettingsCommand({
          resendApiKey: data.resendApiKey ? data.resendApiKey : null,
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

export async function testResendConnectionAction(
  apiKey: string,
): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      const result = await testResendConnection(apiKey);
      await recordResendConnectionStatus(
        result.success ? "connected" : "error",
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
    action: "update",
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
      action: "update",
      execute: async () => {
        await updateTurnstileSettingsCommand({
          turnstileSiteKey: data.turnstileSiteKey
            ? data.turnstileSiteKey
            : null,
          turnstileSecretKey: data.turnstileSecretKey
            ? data.turnstileSecretKey
            : null,
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

export async function testTurnstileConnectionAction(
  siteKey: string,
  secretKey: string,
): Promise<MutationResult<{ note?: string }>> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      const result = await testTurnstileConnection(siteKey, secretKey);
      await recordTurnstileConnectionStatus(
        result.success ? "connected" : "error",
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
    action: "update",
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
        action: "update",
        execute: async () => {
          await updateGoogleMapsSettingsCommand({
            googleMapsApiKey: data.googleMapsApiKey
              ? data.googleMapsApiKey
              : null,
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

export async function testGoogleMapsConnectionAction(
  apiKey: string,
): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      const result = await testGoogleMapsConnection(apiKey);
      await recordGoogleMapsConnectionStatus(
        result.success ? "connected" : "error",
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
    action: "update",
    execute: async () => {
      await clearGoogleMapsSettingsCommand();
      return null;
    },
    afterSuccess: refreshSettingsCache,
  });
}

export async function addCustomApiKey(
  input: CustomApiKeyInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = customApiKeySchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => addCustomApiKeyCommand(omitUndefined(parsed.data)),
    afterSuccess: refreshSettingsCache,
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function deleteCustomApiKey(id: string): Promise<MutationResult> {
  const validated = apiKeyIdSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await deleteCustomApiKeyCommand(validated.data);
      return null;
    },
    afterSuccess: refreshSettingsCache,
  });
}
