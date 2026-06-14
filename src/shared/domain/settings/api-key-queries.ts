import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  maskCloudflareToken,
  maskGoogleMapsKey,
  maskResendKey,
  maskTurnstileKey,
} from "@/shared/lib/api-keys";
import { safeDecrypt } from "@/shared/lib/crypto";
import { serverEnv } from "@/shared/lib/env/server";
import type {
  CloudflareConfig,
  CustomApiKeyData,
  GoogleMapsConfig,
  ResendConfig,
  TurnstileConfig,
} from "@/shared/types/api-keys";
import {
  parseConnectionStatus,
  parseCustomApiKeysMap,
} from "@/shared/domain/settings/api-key-helpers";

async function getApiKeySettings() {
  return prisma.settings.findUnique({
    where: { id: "singleton" },
  });
}

export async function getResendConfig(): Promise<ResendConfig> {
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
 * 送信経路で実際に使う Resend API キーを返す（管理画面で設定された暗号化キーを復号）。
 *
 * Turnstile / Google Maps / Cloudflare と同じ `getDecrypted*` パターン。env を正本とする
 * フォールバックの DB 側として `@/shared/lib/email/client` から参照される（env-OR-DB）。
 */
export async function getDecryptedResendApiKey(): Promise<string | null> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      resendApiKey: true,
    },
  });

  if (!settings?.resendApiKey) {
    return null;
  }

  return safeDecrypt(settings.resendApiKey);
}

export async function getTurnstileConfig(): Promise<TurnstileConfig> {
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

export async function getDecryptedTurnstileSecretKey(): Promise<string | null> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      turnstileSecretKey: true,
    },
  });

  if (!settings?.turnstileSecretKey) {
    return null;
  }

  return safeDecrypt(settings.turnstileSecretKey);
}

export async function getGoogleMapsConfig(): Promise<GoogleMapsConfig> {
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

export async function getDecryptedGoogleMapsApiKey(): Promise<string | null> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      googleMapsApiKey: true,
    },
  });

  if (!settings?.googleMapsApiKey) {
    return null;
  }

  return safeDecrypt(settings.googleMapsApiKey);
}

export async function getCloudflareConfig(): Promise<CloudflareConfig> {
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

export async function getDecryptedCloudflareCredentials(): Promise<{
  zoneId: string;
  apiToken: string;
} | null> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      cloudflareZoneId: true,
      cloudflareApiToken: true,
    },
  });

  if (!settings?.cloudflareZoneId || !settings.cloudflareApiToken) {
    return null;
  }

  const apiToken = safeDecrypt(settings.cloudflareApiToken);
  if (!apiToken) {
    return null;
  }

  return {
    zoneId: settings.cloudflareZoneId,
    apiToken,
  };
}

export async function getCustomApiKeys(): Promise<CustomApiKeyData[]> {
  const settings = await getApiKeySettings();

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

export async function getCustomApiKeyValue(id: string): Promise<string | null> {
  const settings = await getApiKeySettings();
  const keysMap = settings?.customApiKeys
    ? parseCustomApiKeysMap(settings.customApiKeys)
    : null;

  if (!keysMap || !keysMap[id]) {
    return null;
  }

  return safeDecrypt(keysMap[id].keyValue);
}

/**
 * 主要外部統合の接続状態サマリー（dashboard ヘルスチェック用）。
 * 各キーが復号可能な値を持つかを `boolean` で返す。
 */
export async function getIntegrationHealthSummary(): Promise<{
  readonly resend: boolean;
  readonly stripe: boolean;
  readonly googleCalendar: boolean;
  readonly turnstile: boolean;
}> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      resendApiKey: true,
      stripeSecretKey: true,
      googleCalendarEnabled: true,
      googleCalendarConnectionStatus: true,
      turnstileSecretKey: true,
    },
  });

  return {
    // 送信経路（client.ts）と同じ env-OR-DB ソースで判定する。env キーが正本のため
    // env のみ設定／DB のみ設定のどちらでも「接続済み」を正しく反映する（health が嘘をつかない）。
    resend: Boolean(
      serverEnv.RESEND_API_KEY ||
      (settings?.resendApiKey && safeDecrypt(settings.resendApiKey)),
    ),
    stripe: Boolean(
      settings?.stripeSecretKey && safeDecrypt(settings.stripeSecretKey),
    ),
    googleCalendar: Boolean(
      settings?.googleCalendarEnabled &&
      settings?.googleCalendarConnectionStatus === "connected",
    ),
    turnstile: Boolean(
      settings?.turnstileSecretKey && safeDecrypt(settings.turnstileSecretKey),
    ),
  };
}
