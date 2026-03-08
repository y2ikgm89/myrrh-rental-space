"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import { createSuccess, type ActionResult } from "@/admin/types/server-actions";
import {
  testCloudflareConnection,
  testGoogleMapsConnection,
  testResendConnection,
  testTurnstileConnection,
} from "@/admin/lib/api-keys";
import {
  cloudflareSettingsSchema,
  customApiKeySchema,
  googleMapsSettingsSchema,
  resendSettingsSchema,
  turnstileSettingsSchema,
  type CloudflareSettingsInput,
  type CustomApiKeyInput,
  type GoogleMapsSettingsInput,
  type ResendSettingsInput,
  type TurnstileSettingsInput,
} from "@/admin/lib/validations/api-keys";
import { createValidationError } from "@/shared/lib/action-helpers";
import {
  addCustomApiKey as addCustomApiKeyCommand,
  clearCloudflareSettings as clearCloudflareSettingsCommand,
  clearGoogleMapsSettings as clearGoogleMapsSettingsCommand,
  clearResendSettings as clearResendSettingsCommand,
  clearTurnstileSettings as clearTurnstileSettingsCommand,
  deleteCustomApiKey as deleteCustomApiKeyCommand,
  recordCloudflareConnectionStatus,
  recordGoogleMapsConnectionStatus,
  recordResendConnectionStatus,
  recordTurnstileConnectionStatus,
  updateCloudflareSettings as updateCloudflareSettingsCommand,
  updateGoogleMapsSettings as updateGoogleMapsSettingsCommand,
  updateResendSettings as updateResendSettingsCommand,
  updateTurnstileSettings as updateTurnstileSettingsCommand,
} from "@/shared/domain/settings/api-key-commands";
import { DomainError } from "@/shared/domain/domain-error";
import { CACHE_TAGS } from "@/shared/lib/constants";

const apiKeyIdSchema = z.string().min(1, { error: "APIキーIDが不正です" });

function refreshSettingsCache(): void {
  updateTag(CACHE_TAGS.SETTINGS);
}

export async function updateResendSettings(
  input: ResendSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = resendSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateResendSettingsCommand(parsed.data);
    },
    success: () => createSuccess("Resend設定を更新しました"),
    afterSuccess: refreshSettingsCache,
  });
}

export async function testResendConnectionAction(
  apiKey: string,
): Promise<ActionResult<{ message: string }>> {
  return executeAdminMutation({
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

      return { message: result.message || "" };
    },
    success: (result) =>
      createSuccess(result.message || "接続に成功しました", result),
  });
}

export async function clearResendKeys(): Promise<ActionResult<void>> {
  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await clearResendSettingsCommand();
    },
    success: () => createSuccess("Resendキーをクリアしました"),
    afterSuccess: refreshSettingsCache,
  });
}

export async function updateTurnstileSettings(
  input: TurnstileSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = turnstileSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateTurnstileSettingsCommand(parsed.data);
    },
    success: () => createSuccess("Turnstile設定を更新しました"),
    afterSuccess: refreshSettingsCache,
  });
}

export async function testTurnstileConnectionAction(
  siteKey: string,
  secretKey: string,
): Promise<ActionResult<{ message: string; note?: string }>> {
  return executeAdminMutation({
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

      return {
        message: result.message || "",
        note:
          typeof result.metadata?.["note"] === "string"
            ? result.metadata["note"]
            : undefined,
      };
    },
    success: (result) =>
      createSuccess(result.message || "検証に成功しました", result),
  });
}

export async function clearTurnstileKeys(): Promise<ActionResult<void>> {
  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await clearTurnstileSettingsCommand();
    },
    success: () => createSuccess("Turnstileキーをクリアしました"),
    afterSuccess: refreshSettingsCache,
  });
}

export async function updateGoogleMapsSettings(
  input: GoogleMapsSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = googleMapsSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateGoogleMapsSettingsCommand(parsed.data);
    },
    success: () => createSuccess("Google Maps設定を更新しました"),
    afterSuccess: refreshSettingsCache,
  });
}

export async function testGoogleMapsConnectionAction(
  apiKey: string,
): Promise<ActionResult<{ message: string }>> {
  return executeAdminMutation({
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

      return { message: result.message || "" };
    },
    success: (result) =>
      createSuccess(result.message || "接続に成功しました", result),
  });
}

export async function clearGoogleMapsKeys(): Promise<ActionResult<void>> {
  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await clearGoogleMapsSettingsCommand();
    },
    success: () => createSuccess("Google Mapsキーをクリアしました"),
    afterSuccess: refreshSettingsCache,
  });
}

export async function updateCloudflareSettings(
  input: CloudflareSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = cloudflareSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateCloudflareSettingsCommand(parsed.data);
    },
    success: () => createSuccess("Cloudflare設定を更新しました"),
    afterSuccess: refreshSettingsCache,
  });
}

export async function testCloudflareConnectionAction(
  zoneId: string,
  apiToken: string,
): Promise<
  ActionResult<{ message: string; zoneName?: string; plan?: string }>
> {
  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      const result = await testCloudflareConnection(zoneId, apiToken);
      await recordCloudflareConnectionStatus(
        result.success ? "connected" : "error",
      );
      refreshSettingsCache();

      if (!result.success) {
        throw new DomainError(
          result.error || "接続テストに失敗しました",
          "VALIDATION",
        );
      }

      return {
        message: result.message || "",
        zoneName:
          typeof result.metadata?.["zoneName"] === "string"
            ? result.metadata["zoneName"]
            : undefined,
        plan:
          typeof result.metadata?.["plan"] === "string"
            ? result.metadata["plan"]
            : undefined,
      };
    },
    success: (result) =>
      createSuccess(result.message || "接続に成功しました", result),
  });
}

export async function clearCloudflareKeys(): Promise<ActionResult<void>> {
  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await clearCloudflareSettingsCommand();
    },
    success: () => createSuccess("Cloudflare設定をクリアしました"),
    afterSuccess: refreshSettingsCache,
  });
}

export async function addCustomApiKey(
  input: CustomApiKeyInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = customApiKeySchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => addCustomApiKeyCommand(parsed.data),
    success: (result) => createSuccess("APIキーを追加しました", result),
    afterSuccess: refreshSettingsCache,
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function deleteCustomApiKey(
  id: string,
): Promise<ActionResult<void>> {
  const validated = apiKeyIdSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await deleteCustomApiKeyCommand(validated.data);
    },
    success: () => createSuccess("APIキーを削除しました"),
    afterSuccess: refreshSettingsCache,
  });
}
