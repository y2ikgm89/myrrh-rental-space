import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import {
  maskGoogleMapsKey,
  maskResendKey,
  maskSwitchBotKey,
  maskTurnstileKey,
} from "@/shared/lib/api-keys";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import { safeDecrypt } from "@/shared/lib/crypto";
import { serverEnv } from "@/shared/lib/env/server";
import type {
  CustomApiKeyData,
  GoogleMapsConfig,
  ResendConfig,
  SwitchBotConfig,
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
 * Turnstile / Google Maps と同じ `getDecrypted*` パターン。DB を正本とし、
 * `@/shared/lib/email/client` の env フォールバックより先に参照される
 * （DB-OR-env、Settings is canonical）。
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
  "use cache";
  cacheTag(CACHE_TAGS.INTEGRATION_SETTINGS);
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);

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
  "use cache";
  cacheTag(CACHE_TAGS.INTEGRATION_SETTINGS);
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);

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

export async function getSwitchBotConfig(): Promise<SwitchBotConfig> {
  "use cache";
  cacheTag(CACHE_TAGS.INTEGRATION_SETTINGS);
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);

  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      switchbotEnabled: true,
      switchbotOpenToken: true,
      switchbotSecretKey: true,
      switchbotPasscodeBufferMinutes: true,
      switchbotLastTestedAt: true,
      switchbotConnectionStatus: true,
    },
  });

  return {
    enabled: settings?.switchbotEnabled ?? false,
    openTokenMasked: settings?.switchbotOpenToken
      ? maskSwitchBotKey(safeDecrypt(settings.switchbotOpenToken) || "****")
      : null,
    secretKeyMasked: settings?.switchbotSecretKey
      ? maskSwitchBotKey(safeDecrypt(settings.switchbotSecretKey) || "****")
      : null,
    passcodeBufferMinutes: settings?.switchbotPasscodeBufferMinutes ?? 15,
    lastTestedAt: settings?.switchbotLastTestedAt || null,
    connectionStatus: parseConnectionStatus(
      settings?.switchbotConnectionStatus,
    ),
  };
}

/**
 * SwitchBot API呼出に使う認証情報を復号して返す。DB未設定なら null
 * （Stripe/Turnstile等と異なりenvフォールバックは持たない — 本連携はテナント固有の
 * 外部SaaS資格情報であり、Secret Manager/本番env配線を新設しない設計のため）。
 */
export async function getDecryptedSwitchBotCredentials(): Promise<{
  openToken: string;
  secretKey: string;
  passcodeBufferMinutes: number;
} | null> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      switchbotEnabled: true,
      switchbotOpenToken: true,
      switchbotSecretKey: true,
      switchbotPasscodeBufferMinutes: true,
    },
  });

  if (
    !settings?.switchbotEnabled ||
    !settings.switchbotOpenToken ||
    !settings.switchbotSecretKey
  ) {
    return null;
  }

  const openToken = safeDecrypt(settings.switchbotOpenToken);
  const secretKey = safeDecrypt(settings.switchbotSecretKey);
  if (!openToken || !secretKey) {
    return null;
  }

  return {
    openToken,
    secretKey,
    passcodeBufferMinutes: settings.switchbotPasscodeBufferMinutes,
  };
}

/**
 * Webhook URL難読化用トークンを復号して返す。未設定なら null。
 */
export async function getDecryptedSwitchBotWebhookPathToken(): Promise<
  string | null
> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { switchbotWebhookPathToken: true },
  });

  if (!settings?.switchbotWebhookPathToken) {
    return null;
  }

  return safeDecrypt(settings.switchbotWebhookPathToken);
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
  readonly switchbot: boolean;
}> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      resendApiKey: true,
      stripeSecretKey: true,
      googleCalendarEnabled: true,
      googleCalendarConnectionStatus: true,
      turnstileSecretKey: true,
      switchbotEnabled: true,
      switchbotOpenToken: true,
      switchbotSecretKey: true,
    },
  });

  return {
    // 送信経路（client.ts / stripe.ts / turnstile.ts）と同じ DB-OR-env ソースで判定する。
    // DB キーが正本のため、DB のみ設定／env のみ設定のどちらでも「接続済み」を
    // 正しく反映する（health が嘘をつかない）。
    resend: Boolean(
      (settings?.resendApiKey && safeDecrypt(settings.resendApiKey)) ||
      serverEnv.RESEND_API_KEY,
    ),
    stripe: Boolean(
      (settings?.stripeSecretKey && safeDecrypt(settings.stripeSecretKey)) ||
      serverEnv.STRIPE_SECRET_KEY,
    ),
    googleCalendar: Boolean(
      settings?.googleCalendarEnabled &&
      settings?.googleCalendarConnectionStatus === "connected",
    ),
    turnstile: Boolean(
      (settings?.turnstileSecretKey &&
        safeDecrypt(settings.turnstileSecretKey)) ||
      serverEnv.TURNSTILE_SECRET_KEY,
    ),
    // SwitchBotはenvフォールバックを持たないためDBのみで判定する。
    switchbot: Boolean(
      settings?.switchbotEnabled &&
      settings.switchbotOpenToken &&
      settings.switchbotSecretKey &&
      safeDecrypt(settings.switchbotOpenToken) &&
      safeDecrypt(settings.switchbotSecretKey),
    ),
  };
}
