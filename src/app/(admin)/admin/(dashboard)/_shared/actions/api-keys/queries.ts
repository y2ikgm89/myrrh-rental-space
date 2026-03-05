"use server";

import { prisma } from "@/shared/lib/prisma";
import { checkReadPermissionFor } from "@/admin/lib/permissions";
import { safeDecrypt } from "@/shared/lib/crypto";
import {
  maskResendKey,
  maskTurnstileKey,
  maskGoogleMapsKey,
  maskCloudflareToken,
  maskGoogleOAuthSecret,
} from "@/admin/lib/api-keys";
import type {
  ResendConfig,
  TurnstileConfig,
  GoogleMapsConfig,
  CloudflareConfig,
  GoogleOAuthConfig,
  CustomApiKeyData,
} from "@/admin/types/api-keys";
import { parseConnectionStatus, parseCustomApiKeysMap } from "./helpers";

// =============================================================================
// GET Actions
// =============================================================================

const checkReadPermission = checkReadPermissionFor("settings");

/**
 * Resend設定を取得
 */
export async function getResendConfig(): Promise<ResendConfig> {
  if (!(await checkReadPermission())) {
    return { apiKeyMasked: null, lastTestedAt: null, connectionStatus: null };
  }

  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      resendApiKey: true,
      resendLastTestedAt: true,
      resendConnectionStatus: true,
    },
  });

  return {
    apiKeyMasked: settings?.resendApiKey
      ? maskResendKey(safeDecrypt(settings.resendApiKey) || "****")
      : null,
    lastTestedAt: settings?.resendLastTestedAt || null,
    connectionStatus: parseConnectionStatus(settings?.resendConnectionStatus),
  };
}

/**
 * Turnstile設定を取得
 */
export async function getTurnstileConfig(): Promise<TurnstileConfig> {
  if (!(await checkReadPermission())) {
    return {
      siteKey: null,
      secretKeyMasked: null,
      lastTestedAt: null,
      connectionStatus: null,
    };
  }

  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      turnstileSiteKey: true,
      turnstileSecretKey: true,
      turnstileLastTestedAt: true,
      turnstileConnectionStatus: true,
    },
  });

  return {
    siteKey: settings?.turnstileSiteKey || null,
    secretKeyMasked: settings?.turnstileSecretKey
      ? maskTurnstileKey(safeDecrypt(settings.turnstileSecretKey) || "****")
      : null,
    lastTestedAt: settings?.turnstileLastTestedAt || null,
    connectionStatus: parseConnectionStatus(
      settings?.turnstileConnectionStatus,
    ),
  };
}

/**
 * Google Maps設定を取得
 */
export async function getGoogleMapsConfig(): Promise<GoogleMapsConfig> {
  if (!(await checkReadPermission())) {
    return { apiKeyMasked: null, lastTestedAt: null, connectionStatus: null };
  }

  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      googleMapsApiKey: true,
      googleMapsLastTestedAt: true,
      googleMapsConnectionStatus: true,
    },
  });

  return {
    apiKeyMasked: settings?.googleMapsApiKey
      ? maskGoogleMapsKey(safeDecrypt(settings.googleMapsApiKey) || "****")
      : null,
    lastTestedAt: settings?.googleMapsLastTestedAt || null,
    connectionStatus: parseConnectionStatus(
      settings?.googleMapsConnectionStatus,
    ),
  };
}

/**
 * Cloudflare設定を取得
 */
export async function getCloudflareConfig(): Promise<CloudflareConfig> {
  if (!(await checkReadPermission())) {
    return {
      zoneId: null,
      apiTokenMasked: null,
      lastTestedAt: null,
      connectionStatus: null,
    };
  }

  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      cloudflareZoneId: true,
      cloudflareApiToken: true,
      cloudflareLastTestedAt: true,
      cloudflareConnectionStatus: true,
    },
  });

  return {
    zoneId: settings?.cloudflareZoneId || null,
    apiTokenMasked: settings?.cloudflareApiToken
      ? maskCloudflareToken(safeDecrypt(settings.cloudflareApiToken) || "****")
      : null,
    lastTestedAt: settings?.cloudflareLastTestedAt || null,
    connectionStatus: parseConnectionStatus(
      settings?.cloudflareConnectionStatus,
    ),
  };
}

/**
 * カスタムAPIキー一覧を取得
 */
export async function getCustomApiKeys(): Promise<CustomApiKeyData[]> {
  if (!(await checkReadPermission())) return [];

  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { customApiKeys: true },
  });

  if (!settings?.customApiKeys || typeof settings.customApiKeys !== "object") {
    return [];
  }

  const keysMap = parseCustomApiKeysMap(settings.customApiKeys);
  return Object.entries(keysMap).map(([id, data]) => ({
    id,
    name: data.name,
    keyName: data.keyName,
    description: data.description,
    lastTestedAt: data.lastTestedAt ? new Date(data.lastTestedAt) : undefined,
    connectionStatus: data.connectionStatus,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  }));
}

/**
 * カスタムAPIキーの復号化された値を取得（内部使用のみ）
 */
export async function getCustomApiKeyValue(id: string): Promise<string | null> {
  if (!(await checkReadPermission())) return null;

  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { customApiKeys: true },
  });

  const keysMap = settings?.customApiKeys
    ? parseCustomApiKeysMap(settings.customApiKeys)
    : null;
  if (!keysMap || !keysMap[id]) {
    return null;
  }

  return safeDecrypt(keysMap[id].keyValue);
}

/**
 * Google OAuth設定を取得
 */
export async function getGoogleOAuthConfig(): Promise<GoogleOAuthConfig> {
  if (!(await checkReadPermission())) {
    return {
      clientId: null,
      clientSecretMasked: null,
      lastTestedAt: null,
      connectionStatus: null,
    };
  }

  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      googleOAuthClientId: true,
      googleOAuthClientSecret: true,
      googleOAuthLastTestedAt: true,
      googleOAuthConnectionStatus: true,
    },
  });

  return {
    clientId: settings?.googleOAuthClientId || null,
    clientSecretMasked: settings?.googleOAuthClientSecret
      ? maskGoogleOAuthSecret(
          safeDecrypt(settings.googleOAuthClientSecret) || "****",
        )
      : null,
    lastTestedAt: settings?.googleOAuthLastTestedAt || null,
    connectionStatus: parseConnectionStatus(
      settings?.googleOAuthConnectionStatus,
    ),
  };
}
