"use server";

import { z } from "zod";
import { checkReadPermissionFor } from "@/admin/lib/permissions";
import {
  getCloudflareConfig as getCloudflareConfigQuery,
  getCustomApiKeys as getCustomApiKeysQuery,
  getCustomApiKeyValue as getCustomApiKeyValueQuery,
  getGoogleMapsConfig as getGoogleMapsConfigQuery,
  getGoogleOAuthConfig as getGoogleOAuthConfigQuery,
  getResendConfig as getResendConfigQuery,
  getTurnstileConfig as getTurnstileConfigQuery,
} from "@/shared/domain/settings/api-key-queries";
import type {
  CloudflareConfig,
  CustomApiKeyData,
  GoogleMapsConfig,
  GoogleOAuthConfig,
  ResendConfig,
  TurnstileConfig,
} from "@/shared/types/api-keys";

const checkReadPermission = checkReadPermissionFor("settings");
const apiKeyIdSchema = z.string().min(1, { error: "APIキーIDが不正です" });

export async function getResendConfig(): Promise<ResendConfig> {
  if (!(await checkReadPermission())) {
    return { apiKeyMasked: null, lastTestedAt: null, connectionStatus: null };
  }

  return getResendConfigQuery();
}

export async function getTurnstileConfig(): Promise<TurnstileConfig> {
  if (!(await checkReadPermission())) {
    return {
      siteKey: null,
      secretKeyMasked: null,
      lastTestedAt: null,
      connectionStatus: null,
    };
  }

  return getTurnstileConfigQuery();
}

export async function getGoogleMapsConfig(): Promise<GoogleMapsConfig> {
  if (!(await checkReadPermission())) {
    return { apiKeyMasked: null, lastTestedAt: null, connectionStatus: null };
  }

  return getGoogleMapsConfigQuery();
}

export async function getCloudflareConfig(): Promise<CloudflareConfig> {
  if (!(await checkReadPermission())) {
    return {
      zoneId: null,
      apiTokenMasked: null,
      lastTestedAt: null,
      connectionStatus: null,
    };
  }

  return getCloudflareConfigQuery();
}

export async function getCustomApiKeys(): Promise<CustomApiKeyData[]> {
  if (!(await checkReadPermission())) {
    return [];
  }

  return getCustomApiKeysQuery();
}

export async function getCustomApiKeyValue(id: string): Promise<string | null> {
  if (!(await checkReadPermission())) {
    return null;
  }

  const validated = apiKeyIdSchema.safeParse(id);
  if (!validated.success) {
    return null;
  }

  return getCustomApiKeyValueQuery(validated.data);
}

export async function getGoogleOAuthConfig(): Promise<GoogleOAuthConfig> {
  if (!(await checkReadPermission())) {
    return {
      clientId: null,
      clientSecretMasked: null,
      lastTestedAt: null,
      connectionStatus: null,
    };
  }

  return getGoogleOAuthConfigQuery();
}
