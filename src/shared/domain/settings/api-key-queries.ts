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
import { safeDecryptToString } from "@/shared/lib/crypto";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import { serverEnv } from "@/shared/lib/env/server";
import type {
  GoogleMapsConfig,
  ResendConfig,
  SwitchBotConfig,
  TurnstileConfig,
} from "@/shared/types/api-keys";
import { getConnectionHealth } from "@/shared/domain/settings/connection-health";
import {
  ConnectionStatus,
  IntegrationKey,
} from "@/shared/lib/validations/enums/prisma-types";

export async function getResendConfig(): Promise<ResendConfig> {
  const [settings, health] = await Promise.all([
    prisma.settingsResend.findUnique({
      where: { id: "singleton" },
      select: {
        resendApiKey: true,
        resendWebhookSecret: true,
      },
    }),
    getConnectionHealth(IntegrationKey.RESEND),
  ]);

  const decryptedApiKey = settings?.resendApiKey
    ? safeDecryptToString(settings.resendApiKey, {
        expectedPurpose: SETTINGS_CRYPTO_PURPOSES.resendApiKey,
      })
    : null;

  return {
    apiKeyMasked: settings?.resendApiKey
      ? maskResendKey(decryptedApiKey || "****")
      : null,
    webhookSecretMasked: settings?.resendWebhookSecret
      ? maskResendKey(
          safeDecryptToString(settings.resendWebhookSecret, {
            expectedPurpose: SETTINGS_CRYPTO_PURPOSES.resendWebhookSecret,
          }) || "****",
        )
      : null,
    lastTestedAt: health.lastCheckedAt,
    connectionStatus: health.status,
    envFallbackActive: !decryptedApiKey && Boolean(serverEnv.RESEND_API_KEY),
  };
}

/**
 * Resend Webhook 署名検証秘密を返す (DB canonical、env は local dev fallback)。
 *
 * `stripeWebhookSecret` と同じ Tier 2 パターン。管理画面 (`ResendSection`) で
 * 設定・rotate される暗号化済み値を優先し、未設定なら `RESEND_WEBHOOK_SECRET`
 * env にフォールバックする。route handler (`/api/webhooks/resend`) は本関数の
 * 返す値で `standardwebhooks` の `Webhook` を初期化する。
 */
export async function getResendWebhookSecret(): Promise<string | null> {
  const settings = await prisma.settingsResend.findUnique({
    where: { id: "singleton" },
    select: {
      resendWebhookSecret: true,
    },
  });

  if (settings?.resendWebhookSecret) {
    const decrypted = safeDecryptToString(settings.resendWebhookSecret, {
      expectedPurpose: SETTINGS_CRYPTO_PURPOSES.resendWebhookSecret,
    });
    if (decrypted) return decrypted;
  }

  return serverEnv.RESEND_WEBHOOK_SECRET ?? null;
}

/**
 * 送信経路で実際に使う Resend API キーを返す（管理画面で設定された暗号化キーを復号）。
 *
 * Turnstile / Google Maps と同じ `getDecrypted*` パターン。DB を正本とし、
 * `@/shared/lib/email/client` の env フォールバックより先に参照される
 * （DB-OR-env、Settings is canonical）。
 */
export async function getDecryptedResendApiKey(): Promise<string | null> {
  const settings = await prisma.settingsResend.findUnique({
    where: { id: "singleton" },
    select: {
      resendApiKey: true,
    },
  });

  if (!settings?.resendApiKey) {
    return null;
  }

  return safeDecryptToString(settings.resendApiKey, {
    expectedPurpose: SETTINGS_CRYPTO_PURPOSES.resendApiKey,
  });
}

export async function getTurnstileConfig(): Promise<TurnstileConfig> {
  "use cache";
  cacheTag(CACHE_TAGS.INTEGRATION_SETTINGS);
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);

  const [settings, health] = await Promise.all([
    prisma.settingsTurnstile.findUnique({
      where: { id: "singleton" },
      select: {
        turnstileSiteKey: true,
        turnstileSecretKey: true,
      },
    }),
    getConnectionHealth(IntegrationKey.TURNSTILE),
  ]);

  const decryptedSecretKey = settings?.turnstileSecretKey
    ? safeDecryptToString(settings.turnstileSecretKey, {
        expectedPurpose: SETTINGS_CRYPTO_PURPOSES.turnstileSecretKey,
      })
    : null;

  return {
    siteKey: settings?.turnstileSiteKey || null,
    secretKeyMasked: settings?.turnstileSecretKey
      ? maskTurnstileKey(decryptedSecretKey || "****")
      : null,
    lastTestedAt: health.lastCheckedAt,
    connectionStatus: health.status,
    envFallbackActive:
      !decryptedSecretKey && Boolean(serverEnv.TURNSTILE_SECRET_KEY),
  };
}

/**
 * 接続テスト用の Turnstile Site Key。`getTurnstileConfig` は `"use cache"` のため使わない。
 */
export async function getTurnstileSiteKeyUncached(): Promise<string | null> {
  const settings = await prisma.settingsTurnstile.findUnique({
    where: { id: "singleton" },
    select: { turnstileSiteKey: true },
  });
  return settings?.turnstileSiteKey || null;
}

export async function getDecryptedTurnstileSecretKey(): Promise<string | null> {
  const settings = await prisma.settingsTurnstile.findUnique({
    where: { id: "singleton" },
    select: {
      turnstileSecretKey: true,
    },
  });

  if (!settings?.turnstileSecretKey) {
    return null;
  }

  return safeDecryptToString(settings.turnstileSecretKey, {
    expectedPurpose: SETTINGS_CRYPTO_PURPOSES.turnstileSecretKey,
  });
}

export async function getGoogleMapsConfig(): Promise<GoogleMapsConfig> {
  const [settings, health] = await Promise.all([
    prisma.settingsGoogleMaps.findUnique({
      where: { id: "singleton" },
      select: {
        googleMapsApiKey: true,
      },
    }),
    getConnectionHealth(IntegrationKey.GOOGLE_MAPS),
  ]);

  return {
    apiKeyMasked: settings?.googleMapsApiKey
      ? maskGoogleMapsKey(
          safeDecryptToString(settings.googleMapsApiKey, {
            expectedPurpose: SETTINGS_CRYPTO_PURPOSES.googleMapsApiKey,
          }) || "****",
        )
      : null,
    lastTestedAt: health.lastCheckedAt,
    connectionStatus: health.status,
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
  // AccessMap は拠点ごとに呼ばれるため、素の findUnique だと一時的な DB 障害が
  // /access ページ全体（他拠点の住所・営業時間等、地図と無関係な情報まで）を
  // クラッシュさせる。他の公開クエリと同じく safeFetch で fallback: null に握る。
  const settings = await safeFetch({
    fetch: () =>
      prisma.settingsGoogleMaps.findUnique({
        where: { id: "singleton" },
        select: {
          googleMapsApiKey: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getDecryptedGoogleMapsApiKey",
  });

  if (!settings?.googleMapsApiKey) {
    return null;
  }

  return safeDecryptToString(settings.googleMapsApiKey, {
    expectedPurpose: SETTINGS_CRYPTO_PURPOSES.googleMapsApiKey,
  });
}

export async function getSwitchBotConfig(): Promise<SwitchBotConfig> {
  "use cache";
  cacheTag(CACHE_TAGS.INTEGRATION_SETTINGS);
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);

  const [settings, health] = await Promise.all([
    prisma.settingsSwitchbot.findUnique({
      where: { id: "singleton" },
      select: {
        switchbotEnabled: true,
        switchbotOpenToken: true,
        switchbotSecretKey: true,
        switchbotPasscodeBufferMinutes: true,
      },
    }),
    getConnectionHealth(IntegrationKey.SWITCHBOT),
  ]);

  return {
    enabled: settings?.switchbotEnabled ?? false,
    openTokenMasked: settings?.switchbotOpenToken
      ? maskSwitchBotKey(
          safeDecryptToString(settings.switchbotOpenToken, {
            expectedPurpose: SETTINGS_CRYPTO_PURPOSES.switchbotOpenToken,
          }) || "****",
        )
      : null,
    secretKeyMasked: settings?.switchbotSecretKey
      ? maskSwitchBotKey(
          safeDecryptToString(settings.switchbotSecretKey, {
            expectedPurpose: SETTINGS_CRYPTO_PURPOSES.switchbotSecretKey,
          }) || "****",
        )
      : null,
    passcodeBufferMinutes: settings?.switchbotPasscodeBufferMinutes ?? 15,
    lastTestedAt: health.lastCheckedAt,
    connectionStatus: health.status,
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
  const settings = await prisma.settingsSwitchbot.findUnique({
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

  const openToken = safeDecryptToString(settings.switchbotOpenToken, {
    expectedPurpose: SETTINGS_CRYPTO_PURPOSES.switchbotOpenToken,
  });
  const secretKey = safeDecryptToString(settings.switchbotSecretKey, {
    expectedPurpose: SETTINGS_CRYPTO_PURPOSES.switchbotSecretKey,
  });
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
 * revoke / clear / cleanup / 接続テスト専用の SwitchBot 資格情報復号。
 *
 * `getDecryptedSwitchBotCredentials` は createKey（issue）経路用で
 * `switchbotEnabled=true` を要求する。連携 OFF 後も物理 key の deleteKey と
 * 接続テストには暗号化済み資格情報が必要なため、本関数は `switchbotEnabled`
 * を見ず、暗号文が残っていれば復号する。issue / webhook createKey 確定には
 * 使わないこと。接続テストは本関数を使ってよい。
 */
export async function getDecryptedSwitchBotCredentialsForRevocation(): Promise<{
  openToken: string;
  secretKey: string;
} | null> {
  const settings = await prisma.settingsSwitchbot.findUnique({
    where: { id: "singleton" },
    select: {
      switchbotOpenToken: true,
      switchbotSecretKey: true,
    },
  });

  if (!settings?.switchbotOpenToken || !settings.switchbotSecretKey) {
    return null;
  }

  const openToken = safeDecryptToString(settings.switchbotOpenToken, {
    expectedPurpose: SETTINGS_CRYPTO_PURPOSES.switchbotOpenToken,
  });
  const secretKey = safeDecryptToString(settings.switchbotSecretKey, {
    expectedPurpose: SETTINGS_CRYPTO_PURPOSES.switchbotSecretKey,
  });
  if (!openToken || !secretKey) {
    return null;
  }

  return { openToken, secretKey };
}

/**
 * SwitchBot 連携の有効状態だけを返す（cron の kill switch 用）。
 * `getSwitchBotConfig` は `"use cache"` + STATIC_SETTINGS のため、admin の
 * `updateTag` が public Cloud Run に届かない。ここはキャッシュせず DB を読む。
 */
export async function getSwitchBotEnabled(): Promise<boolean> {
  const settings = await prisma.settingsSwitchbot.findUnique({
    where: { id: "singleton" },
    select: { switchbotEnabled: true },
  });
  return settings?.switchbotEnabled ?? false;
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
  const settings = await prisma.settingsSwitchbot.findUnique({
    where: { id: "singleton" },
    select: { switchbotEnabled: true, switchbotWebhookPathToken: true },
  });

  return {
    enabled: settings?.switchbotEnabled ?? false,
    pathToken: settings?.switchbotWebhookPathToken
      ? safeDecryptToString(settings.switchbotWebhookPathToken, {
          expectedPurpose: SETTINGS_CRYPTO_PURPOSES.switchbotWebhookPathToken,
        })
      : null,
  };
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
  const [resend, stripe, googleCalendar, turnstile, switchbot, calendarHealth] =
    await Promise.all([
      prisma.settingsResend.findUnique({
        where: { id: "singleton" },
        select: { resendApiKey: true },
      }),
      prisma.settingsStripe.findUnique({
        where: { id: "singleton" },
        select: { stripeSecretKey: true, stripeWebhookSecret: true },
      }),
      prisma.settingsGoogleCalendar.findUnique({
        where: { id: "singleton" },
        select: {
          googleCalendarEnabled: true,
        },
      }),
      prisma.settingsTurnstile.findUnique({
        where: { id: "singleton" },
        select: { turnstileSecretKey: true },
      }),
      prisma.settingsSwitchbot.findUnique({
        where: { id: "singleton" },
        select: {
          switchbotEnabled: true,
          switchbotOpenToken: true,
          switchbotSecretKey: true,
        },
      }),
      getConnectionHealth(IntegrationKey.GOOGLE_CALENDAR),
    ]);

  return {
    // 送信経路（client.ts / stripe.ts / domain/settings/turnstile.ts）と同じ DB-OR-env ソースで判定する。
    // DB キーが正本のため、DB のみ設定／env のみ設定のどちらでも「接続済み」を
    // 正しく反映する（health が嘘をつかない）。
    resend: Boolean(
      safeDecryptToString(resend?.resendApiKey, {
        expectedPurpose: SETTINGS_CRYPTO_PURPOSES.resendApiKey,
      }) || serverEnv.RESEND_API_KEY,
    ),
    stripe: Boolean(
      (safeDecryptToString(stripe?.stripeSecretKey, {
        expectedPurpose: SETTINGS_CRYPTO_PURPOSES.stripeSecretKey,
      }) ||
        serverEnv.STRIPE_SECRET_KEY) &&
      stripe?.stripeWebhookSecret,
    ),
    googleCalendar: Boolean(
      googleCalendar?.googleCalendarEnabled &&
      calendarHealth.status === ConnectionStatus.CONNECTED,
    ),
    turnstile: Boolean(
      safeDecryptToString(turnstile?.turnstileSecretKey, {
        expectedPurpose: SETTINGS_CRYPTO_PURPOSES.turnstileSecretKey,
      }) || serverEnv.TURNSTILE_SECRET_KEY,
    ),
    // SwitchBotはenvフォールバックを持たないためDBのみで判定する。
    switchbot: Boolean(
      switchbot?.switchbotEnabled &&
      switchbot.switchbotOpenToken &&
      switchbot.switchbotSecretKey &&
      safeDecryptToString(switchbot.switchbotOpenToken, {
        expectedPurpose: SETTINGS_CRYPTO_PURPOSES.switchbotOpenToken,
      }) &&
      safeDecryptToString(switchbot.switchbotSecretKey, {
        expectedPurpose: SETTINGS_CRYPTO_PURPOSES.switchbotSecretKey,
      }),
    ),
  };
}
