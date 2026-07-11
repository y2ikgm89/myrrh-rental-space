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
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import { serverEnv } from "@/shared/lib/env/server";

/**
 * 呼び出し側で `safeDecrypt(...)?.toString("utf8") ?? null` を毎回書かないための
 * per-file helper。Buffer を utf-8 string に橋渡しし、非 truthy な入力は素通り。
 * ここでの purpose 明示は `crypto.ts` 側の必須 defense-in-depth に対応する。
 */
function decryptToString(
  ciphertext: string | null | undefined,
  expectedPurpose: string,
): string | null {
  if (!ciphertext) return null;
  return safeDecrypt(ciphertext, { expectedPurpose })?.toString("utf8") ?? null;
}
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
      ? maskResendKey(
          decryptToString(
            settings.resendApiKey,
            SETTINGS_CRYPTO_PURPOSES.resendApiKey,
          ) || "****",
        )
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

  return decryptToString(
    settings.resendApiKey,
    SETTINGS_CRYPTO_PURPOSES.resendApiKey,
  );
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
      ? maskTurnstileKey(
          decryptToString(
            settings.turnstileSecretKey,
            SETTINGS_CRYPTO_PURPOSES.turnstileSecretKey,
          ) || "****",
        )
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

  return decryptToString(
    settings.turnstileSecretKey,
    SETTINGS_CRYPTO_PURPOSES.turnstileSecretKey,
  );
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
      ? maskGoogleMapsKey(
          decryptToString(
            settings.googleMapsApiKey,
            SETTINGS_CRYPTO_PURPOSES.googleMapsApiKey,
          ) || "****",
        )
      : null,
    lastTestedAt: settings?.googleMapsLastTestedAt || null,
    connectionStatus: parseConnectionStatus(
      settings?.googleMapsConnectionStatus,
    ),
  };
}

/**
 * Google Maps API キーを復号して返す（送信経路で使う）。
 *
 * `getDecryptedTurnstileSecretKey` / `getDecryptedResendApiKey` /
 * `getDecryptedSwitchBotCredentials` と対称に `'use cache'` を通さず直接 DB
 * を読む。復号済み plaintext を data cache に貯めると key rotation / kill switch
 * の即時反映が失われ、かつ他 secret 系との drift になる。マスク済み表示用は
 * `getGoogleMapsConfig` を使う（DB read のみ）。
 */
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

  return decryptToString(
    settings.googleMapsApiKey,
    SETTINGS_CRYPTO_PURPOSES.googleMapsApiKey,
  );
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
      ? maskSwitchBotKey(
          decryptToString(
            settings.switchbotOpenToken,
            SETTINGS_CRYPTO_PURPOSES.switchbotOpenToken,
          ) || "****",
        )
      : null,
    secretKeyMasked: settings?.switchbotSecretKey
      ? maskSwitchBotKey(
          decryptToString(
            settings.switchbotSecretKey,
            SETTINGS_CRYPTO_PURPOSES.switchbotSecretKey,
          ) || "****",
        )
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

  const openToken = decryptToString(
    settings.switchbotOpenToken,
    SETTINGS_CRYPTO_PURPOSES.switchbotOpenToken,
  );
  const secretKey = decryptToString(
    settings.switchbotSecretKey,
    SETTINGS_CRYPTO_PURPOSES.switchbotSecretKey,
  );
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
 * Webhook URL難読化用トークンと連携の有効状態を返す（webhook route の認可用）。
 * `switchbotEnabled: false` の間は、正しいトークンでも常に無効として扱う
 * （設定画面のトグルOFFがwebhook経路も含めた実効的なkill switchになるように）。
 * "use cache" を使わず直接DBを読むのは、無効化の即時反映を保証するため。
 */
export async function getSwitchBotWebhookAuth(): Promise<{
  readonly enabled: boolean;
  readonly pathToken: string | null;
}> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { switchbotEnabled: true, switchbotWebhookPathToken: true },
  });

  return {
    enabled: settings?.switchbotEnabled ?? false,
    pathToken: settings?.switchbotWebhookPathToken
      ? decryptToString(
          settings.switchbotWebhookPathToken,
          SETTINGS_CRYPTO_PURPOSES.switchbotWebhookPathToken,
        )
      : null,
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

  return decryptToString(
    keysMap[id].keyValue,
    SETTINGS_CRYPTO_PURPOSES.customApiKey,
  );
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
      decryptToString(
        settings?.resendApiKey,
        SETTINGS_CRYPTO_PURPOSES.resendApiKey,
      ) || serverEnv.RESEND_API_KEY,
    ),
    stripe: Boolean(
      decryptToString(
        settings?.stripeSecretKey,
        SETTINGS_CRYPTO_PURPOSES.stripeSecretKey,
      ) || serverEnv.STRIPE_SECRET_KEY,
    ),
    googleCalendar: Boolean(
      settings?.googleCalendarEnabled &&
      settings?.googleCalendarConnectionStatus === "connected",
    ),
    turnstile: Boolean(
      decryptToString(
        settings?.turnstileSecretKey,
        SETTINGS_CRYPTO_PURPOSES.turnstileSecretKey,
      ) || serverEnv.TURNSTILE_SECRET_KEY,
    ),
    // SwitchBotはenvフォールバックを持たないためDBのみで判定する。
    switchbot: Boolean(
      settings?.switchbotEnabled &&
      settings.switchbotOpenToken &&
      settings.switchbotSecretKey &&
      decryptToString(
        settings.switchbotOpenToken,
        SETTINGS_CRYPTO_PURPOSES.switchbotOpenToken,
      ) &&
      decryptToString(
        settings.switchbotSecretKey,
        SETTINGS_CRYPTO_PURPOSES.switchbotSecretKey,
      ),
    ),
  };
}
