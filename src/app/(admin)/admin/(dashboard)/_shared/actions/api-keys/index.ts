"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
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
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { omitUndefined } from "@/shared/lib/serialize";
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
import type { MutationResult } from "@/shared/lib/mutation-result";

const apiKeyIdSchema = z.string().min(1, { error: "APIキーIDが不正です" });

function refreshSettingsCache(): void {
  updateTag(CACHE_TAGS.INTEGRATION_SETTINGS);
}

export async function updateResendSettings(
  input: ResendSettingsInput,
): Promise<MutationResult> {
  const parsed = resendSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateResendSettingsCommand(omitUndefined(parsed.data));
      return null;
    },
    afterSuccess: refreshSettingsCache,
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

export async function updateTurnstileSettings(
  input: TurnstileSettingsInput,
): Promise<MutationResult> {
  const parsed = turnstileSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateTurnstileSettingsCommand(omitUndefined(parsed.data));
      return null;
    },
    afterSuccess: refreshSettingsCache,
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

export async function updateGoogleMapsSettings(
  input: GoogleMapsSettingsInput,
): Promise<MutationResult> {
  const parsed = googleMapsSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateGoogleMapsSettingsCommand(omitUndefined(parsed.data));
      return null;
    },
    afterSuccess: refreshSettingsCache,
  });
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

export async function updateCloudflareSettings(
  input: CloudflareSettingsInput,
): Promise<MutationResult> {
  const parsed = cloudflareSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateCloudflareSettingsCommand(omitUndefined(parsed.data));
      return null;
    },
    afterSuccess: refreshSettingsCache,
  });
}

export async function testCloudflareConnectionAction(
  zoneId: string,
  apiToken: string,
): Promise<MutationResult<{ zoneName?: string; plan?: string }>> {
  return executeAdminMutationResult({
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

      return omitUndefined({
        zoneName:
          typeof result.metadata?.["zoneName"] === "string"
            ? result.metadata["zoneName"]
            : undefined,
        plan:
          typeof result.metadata?.["plan"] === "string"
            ? result.metadata["plan"]
            : undefined,
      });
    },
  });
}

export async function clearCloudflareKeys(): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await clearCloudflareSettingsCommand();
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
