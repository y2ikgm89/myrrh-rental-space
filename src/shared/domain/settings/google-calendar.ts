/**
 * Google Calendar Settings orchestration（semantic gates / credentials / webhook renew）。
 *
 * `shared/lib/google-calendar` は Google API client・helpers のみ。
 * Settings I/O と永続化オーケストレーションは本モジュールが担当する。
 *
 * @module shared/domain/settings/google-calendar
 */

import "server-only";

import type { calendar_v3 } from "googleapis";
import {
  getGoogleCalendarServiceAccountConfig,
  getGoogleCalendarSettings,
  getGoogleCalendarWebhookState,
  getTwoWaySyncSettings,
} from "@/shared/domain/settings/admin-queries";
import { saveGoogleCalendarWebhook } from "@/shared/domain/settings/integration-commands";
import { getAppUrl } from "@/shared/lib/constants";
import { safeDecryptToString } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { createCalendarClientFromServiceAccountJson } from "@/shared/lib/google-calendar/service-account";
import type { WebhookRenewalResult } from "@/shared/lib/google-calendar/types";
import { setupWebhookWatch } from "@/shared/lib/google-calendar/webhook";
import { omitUndefined } from "@/shared/lib/serialize";
import { CalendarSyncMethod } from "@/shared/lib/validations/enums/prisma-types";

const WEBHOOK_RENEWAL_THRESHOLD_DAYS = 2;

/**
 * Google Calendar 連携が稼働可能な状態か判定する（semantic helper）。
 *
 * `enabled` フラグ ON かつ接続テスト通過済みの場合のみ true。
 */
export async function isGoogleCalendarEnabled(): Promise<boolean> {
  const settings = await getGoogleCalendarSettings();
  return settings.enabled && settings.connectionStatus === "connected";
}

/**
 * Google Calendar への書込み (mutate) が技術的に可能かどうかを判定する
 * (GCAL-OUTBOUND-05)。
 *
 * `isGoogleCalendarEnabled` と異なり `googleCalendarEnabled` トグルを見ない
 * — サービスアカウント JSON とカレンダー ID さえ設定されていれば true を返す。
 *
 * 用途: create/update は `isGoogleCalendarEnabled()` でユーザーが意図的に
 * OFF にした間は一切書き込まない（既存契約）。一方 delete はトグル OFF でも
 * 実行できないと、無効化した瞬間に以降のキャンセル/削除が GCal 側の孤児
 * event をクリーンアップできなくなる（disable した瞬間に事故る設計は禁止）。
 * `deleteCalendarSync` / `deleteEventCalendarSync` / `deleteGcalMaster` /
 * `patchGcalMasterUntil` はこちらを gate に使う。
 */
export async function isGoogleCalendarConfigured(): Promise<boolean> {
  const [serviceAccountConfig, settings] = await Promise.all([
    getGoogleCalendarServiceAccountConfig(),
    getGoogleCalendarSettings(),
  ]);
  return (
    serviceAccountConfig.encryptedServiceAccountJson !== null &&
    settings.calendarId !== null
  );
}

/**
 * 双方向同期が稼働可能な状態か判定する（semantic helper）。
 *
 * Calendar 自体が enabled + 接続 OK で、かつ two-way sync toggle が ON の場合のみ true。
 * 2 クエリを Promise.all で並行実行する（webhook route の hot path のため）。
 */
export async function isTwoWaySyncEnabled(): Promise<boolean> {
  const [calendarSettings, twoWaySyncSettings] = await Promise.all([
    getGoogleCalendarSettings(),
    getTwoWaySyncSettings(),
  ]);
  return (
    calendarSettings.enabled &&
    calendarSettings.connectionStatus === "connected" &&
    twoWaySyncSettings.enabled
  );
}

/**
 * サービスアカウントの Google Calendar API クライアントを取得する。
 *
 * `options.ignoreEnabledToggle` (GCAL-OUTBOUND-05): true のとき
 * `googleCalendarEnabled` トグルの ON/OFF を無視し、サービスアカウント JSON が
 * 設定されていればクライアントを返す。delete 系の呼出し (`deleteCalendarEvent`
 * / `patchCalendarEvent` を `ignoreEnabledToggle: true` で呼ぶ経路) 専用で、
 * トグル OFF でも既存 GCal event の削除・打ち切りだけは行えるようにするための
 * gate 緩和。省略時 (false 相当) は既存どおりトグル ON 必須。
 */
export async function getServiceAccountClient(options?: {
  ignoreEnabledToggle?: boolean;
}): Promise<calendar_v3.Calendar | null> {
  const settings = await getGoogleCalendarServiceAccountConfig();

  if (!settings.encryptedServiceAccountJson) {
    return null;
  }
  if (!options?.ignoreEnabledToggle && !settings.enabled) {
    return null;
  }

  const decryptedJson = safeDecryptToString(
    settings.encryptedServiceAccountJson,
    {
      expectedPurpose: SETTINGS_CRYPTO_PURPOSES.googleCalendarServiceAccount,
    },
  );
  if (!decryptedJson) {
    logError(new Error("Failed to decrypt service account credentials"), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: "getServiceAccountClient" },
    });
    return null;
  }

  return createCalendarClientFromServiceAccountJson(
    decryptedJson,
    "getServiceAccountClient",
  );
}

/**
 * Webhook の自動更新チェック。
 *
 * 有効期限の 2 日前になったら自動的に更新する。
 * 既存の Webhook を停止し、新しい Webhook を設定して Settings に永続化する。
 */
export async function renewWebhookIfNeeded(): Promise<WebhookRenewalResult> {
  const [webhookState, syncSettings] = await Promise.all([
    getGoogleCalendarWebhookState(),
    getTwoWaySyncSettings(),
  ]);

  if (!webhookState.expiration) {
    return { success: true, renewed: false };
  }

  if (
    syncSettings.syncMethod !== CalendarSyncMethod.webhook &&
    syncSettings.syncMethod !== CalendarSyncMethod.both
  ) {
    return { success: true, renewed: false };
  }

  // 認証トークン復号失敗（レガシー平文 / kid 不一致 / 破損）の場合は強制再登録する。
  // getGoogleCalendarWebhookState は復号失敗時に token を null にして返すため、
  // channelId は残っているのに token が null という状態はこの状況を意味する。
  // route.ts の !settings.token 分岐で webhook 到達も 503 で拒否されているため、
  // 期限を待たず即座に clear + 再登録して encrypt-at-rest ciphertext を書き直す。
  const tokenNeedsReregistration =
    !!webhookState.channelId && webhookState.token === null;

  if (!tokenNeedsReregistration) {
    const now = new Date();
    const threshold = new Date(now);
    threshold.setDate(threshold.getDate() + WEBHOOK_RENEWAL_THRESHOLD_DAYS);

    if (webhookState.expiration > threshold) {
      return { success: true, renewed: false };
    }
  }

  try {
    const client = await getServiceAccountClient();
    if (!client) {
      return {
        success: false,
        renewed: false,
        error: "Google Calendar is not configured",
      };
    }

    // 旧 channel 停止は `setupWebhookWatch` 内に集約（best-effort）。
    // token 復号失敗の強制再登録も、watch 成功後の原子 save で
    // token+channel+expiration を一括置換する（事前 clear は不要）。
    const baseUrl = getAppUrl();
    const webhookUrl = `${baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`}/api/webhooks/google-calendar`;
    const result = await setupWebhookWatch(client, webhookState, webhookUrl);

    if (!result.success) {
      return omitUndefined({
        success: false,
        renewed: false,
        error: result.error,
      });
    }

    if (!result.channelId || !result.resourceId || !result.token) {
      return {
        success: false,
        renewed: false,
        error: "Google Calendar webhook response is invalid",
      };
    }

    await saveGoogleCalendarWebhook({
      channelId: result.channelId,
      resourceId: result.resourceId,
      expiration: result.expiration,
      token: result.token,
    });

    return omitUndefined({
      success: true,
      renewed: true,
      newExpiration: result.expiration,
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "renewWebhookIfNeeded" },
    });
    return {
      success: false,
      renewed: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
