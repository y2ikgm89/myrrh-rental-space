import "server-only";

import { randomBytes } from "node:crypto";
import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";
import { DomainError } from "@/shared/domain/domain-error";
import { encrypt, safeDecryptToString } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import {
  ConnectionStatus,
  SmartLockPasscodeStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  getDecryptedSwitchBotCredentials,
  getDecryptedSwitchBotCredentialsForRevocation,
  getSwitchBotWebhookAuth,
} from "@/shared/domain/settings/api-key-queries";
import {
  awaitDeviceRevokeConfirmation,
  recoverPendingPasscodeViaDeviceList,
  revokeOne,
} from "@/shared/domain/smart-lock/revoke-passcode";
import {
  deleteWebhook,
  queryWebhookUrls,
  setupWebhook,
} from "@/shared/lib/smart-lock/switchbot-client";
import { getAppUrl } from "@/shared/lib/constants";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

async function upsertResendSettings(
  updateData: Omit<Prisma.SettingsResendCreateInput, "id">,
): Promise<void> {
  await prisma.settingsResend.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

async function upsertTurnstileSettings(
  updateData: Omit<Prisma.SettingsTurnstileCreateInput, "id">,
): Promise<void> {
  await prisma.settingsTurnstile.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

async function upsertGoogleMapsSettings(
  updateData: Omit<Prisma.SettingsGoogleMapsCreateInput, "id">,
): Promise<void> {
  await prisma.settingsGoogleMaps.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

async function upsertSwitchbotSettings(
  updateData: Omit<Prisma.SettingsSwitchbotCreateInput, "id">,
): Promise<void> {
  await prisma.settingsSwitchbot.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

function encryptSecret(
  value: string,
  message: string,
  purpose: string,
): string {
  try {
    return encrypt(value, { purpose });
  } catch {
    throw new DomainError(message, "VALIDATION");
  }
}

export async function updateResendSettings(data: {
  resendApiKey?: string | null;
  resendWebhookSecret?: string | null;
}): Promise<void> {
  const updateData: Omit<Prisma.SettingsResendCreateInput, "id"> = {};

  if (data.resendApiKey) {
    updateData.resendApiKey = encryptSecret(
      data.resendApiKey,
      "APIキーの暗号化に失敗しました",
      SETTINGS_CRYPTO_PURPOSES.resendApiKey,
    );
  }

  // Webhook 署名秘密。空 (falsy) は「既存値を維持」として扱う
  // (stripeWebhookSecret と同じ意味論、クリアは clearResendSettings 経由)。
  if (data.resendWebhookSecret) {
    updateData.resendWebhookSecret = encryptSecret(
      data.resendWebhookSecret,
      "Webhookシークレットの暗号化に失敗しました",
      SETTINGS_CRYPTO_PURPOSES.resendWebhookSecret,
    );
  }

  await upsertResendSettings(updateData);
}

export async function recordResendConnectionStatus(
  status: ConnectionStatus,
): Promise<void> {
  await upsertResendSettings({
    resendLastTestedAt: new Date(),
    resendConnectionStatus: status,
  });
}

export async function clearResendSettings(): Promise<void> {
  await upsertResendSettings({
    resendApiKey: null,
    resendWebhookSecret: null,
    resendLastTestedAt: null,
    resendConnectionStatus: null,
  });
}

export async function updateTurnstileSettings(data: {
  turnstileSiteKey?: string | null;
  turnstileSecretKey?: string | null;
}): Promise<void> {
  const updateData: Omit<Prisma.SettingsTurnstileCreateInput, "id"> = {};

  // Site Key は管理 UI で「変更」ボタンによりロックされる公開キー。ロック中の保存は
  // 空送信になるため、空（falsy）は「既存値を維持」として扱う（Secret Key と同じ意味論）。
  // クリアは clearTurnstileSettings（「クリア」ボタン）経由で行う。
  if (data.turnstileSiteKey) {
    updateData.turnstileSiteKey = data.turnstileSiteKey;
  }

  if (data.turnstileSecretKey) {
    updateData.turnstileSecretKey = encryptSecret(
      data.turnstileSecretKey,
      "シークレットキーの暗号化に失敗しました",
      SETTINGS_CRYPTO_PURPOSES.turnstileSecretKey,
    );
  }

  await upsertTurnstileSettings(updateData);
}

export async function recordTurnstileConnectionStatus(
  status: ConnectionStatus,
): Promise<void> {
  await upsertTurnstileSettings({
    turnstileLastTestedAt: new Date(),
    turnstileConnectionStatus: status,
  });
}

export async function clearTurnstileSettings(): Promise<void> {
  await upsertTurnstileSettings({
    turnstileSiteKey: null,
    turnstileSecretKey: null,
    turnstileLastTestedAt: null,
    turnstileConnectionStatus: null,
  });
}

export async function updateGoogleMapsSettings(data: {
  googleMapsApiKey?: string | null;
}): Promise<void> {
  const updateData: Omit<Prisma.SettingsGoogleMapsCreateInput, "id"> = {};

  if (data.googleMapsApiKey) {
    updateData.googleMapsApiKey = encryptSecret(
      data.googleMapsApiKey,
      "APIキーの暗号化に失敗しました",
      SETTINGS_CRYPTO_PURPOSES.googleMapsApiKey,
    );
  }

  await upsertGoogleMapsSettings(updateData);
}

export async function recordGoogleMapsConnectionStatus(
  status: ConnectionStatus,
): Promise<void> {
  await upsertGoogleMapsSettings({
    googleMapsLastTestedAt: new Date(),
    googleMapsConnectionStatus: status,
  });
}

export async function clearGoogleMapsSettings(): Promise<void> {
  await upsertGoogleMapsSettings({
    googleMapsApiKey: null,
    googleMapsLastTestedAt: null,
    googleMapsConnectionStatus: null,
  });
}

export async function updateSwitchBotSettings(data: {
  switchbotEnabled?: boolean;
  switchbotOpenToken?: string | null;
  switchbotSecretKey?: string | null;
  switchbotPasscodeBufferMinutes?: number;
}): Promise<void> {
  const existing = await prisma.settingsSwitchbot.findUnique({
    where: { id: "singleton" },
    select: {
      switchbotEnabled: true,
      switchbotOpenToken: true,
      switchbotSecretKey: true,
    },
  });

  const supplyingOpenToken = Boolean(data.switchbotOpenToken);
  const supplyingSecretKey = Boolean(data.switchbotSecretKey);
  if (supplyingOpenToken !== supplyingSecretKey) {
    const otherExists = supplyingOpenToken
      ? Boolean(existing?.switchbotSecretKey)
      : Boolean(existing?.switchbotOpenToken);
    if (!otherExists) {
      throw new DomainError(
        "Open TokenとSecret Keyは両方揃えて保存してください",
        "VALIDATION",
      );
    }
  }

  const willBeEnabled =
    data.switchbotEnabled !== undefined
      ? data.switchbotEnabled
      : (existing?.switchbotEnabled ?? false);
  const hasOpenToken =
    supplyingOpenToken || Boolean(existing?.switchbotOpenToken);
  const hasSecretKey =
    supplyingSecretKey || Boolean(existing?.switchbotSecretKey);
  if (willBeEnabled && (!hasOpenToken || !hasSecretKey)) {
    throw new DomainError(
      "SwitchBot連携を有効にするには、Open TokenとSecret Keyの両方を保存してください",
      "VALIDATION",
    );
  }

  const updateData: Omit<Prisma.SettingsSwitchbotCreateInput, "id"> = {};

  if (data.switchbotEnabled !== undefined) {
    updateData.switchbotEnabled = data.switchbotEnabled;
  }

  if (data.switchbotOpenToken) {
    updateData.switchbotOpenToken = encryptSecret(
      data.switchbotOpenToken,
      "Open Tokenの暗号化に失敗しました",
      SETTINGS_CRYPTO_PURPOSES.switchbotOpenToken,
    );
  }

  if (data.switchbotSecretKey) {
    updateData.switchbotSecretKey = encryptSecret(
      data.switchbotSecretKey,
      "シークレットキーの暗号化に失敗しました",
      SETTINGS_CRYPTO_PURPOSES.switchbotSecretKey,
    );
  }

  if (data.switchbotPasscodeBufferMinutes !== undefined) {
    updateData.switchbotPasscodeBufferMinutes =
      data.switchbotPasscodeBufferMinutes;
  }

  await upsertSwitchbotSettings(updateData);
}

export async function recordSwitchBotConnectionStatus(
  status: ConnectionStatus,
): Promise<void> {
  await upsertSwitchbotSettings({
    switchbotLastTestedAt: new Date(),
    switchbotConnectionStatus: status,
  });
}

/**
 * SwitchBot連携をクリアする前に、まだ生きている（PENDING/CONFIRMED）パスコードを
 * 現在の資格情報で失効させておく。クリア後は資格情報自体が失われ、二度と
 * deleteKeyできなくなる（物理ドアのパスコードが失効不能なまま残る）ため。
 */
export async function clearSwitchBotSettings(): Promise<void> {
  const credentials = await getDecryptedSwitchBotCredentialsForRevocation();
  // 資格情報が既に復号できない（未設定等）場合はこれ以上 revoke できないため
  // そのままクリアを許可する。
  if (credentials) {
    const unresolvedRevokePending = await prisma.smartLockPasscode.count({
      where: { status: SmartLockPasscodeStatus.REVOKE_PENDING },
    });
    if (unresolvedRevokePending > 0) {
      const allDevicesCleared = await Promise.all(
        (
          await prisma.smartLockPasscode.findMany({
            where: { status: SmartLockPasscodeStatus.REVOKE_PENDING },
            select: { deviceId: true },
            distinct: ["deviceId"],
          })
        ).map((row) => awaitDeviceRevokeConfirmation(row.deviceId)),
      );
      if (!allDevicesCleared.every(Boolean)) {
        throw new DomainError(
          "失効処理中のパスコードが残っているため連携をクリアできません。しばらく待ってから再試行してください",
          "VALIDATION",
        );
      }
    }

    const livePasscodes = await prisma.smartLockPasscode.findMany({
      where: {
        status: {
          in: [
            SmartLockPasscodeStatus.PENDING,
            SmartLockPasscodeStatus.CONFIRMED,
          ],
        },
      },
      select: {
        id: true,
        reservationId: true,
        deviceId: true,
        status: true,
        switchbotKeyId: true,
        device: { select: { deviceId: true } },
      },
    });

    const pendingPasscodes = livePasscodes.filter(
      (p) => p.status === SmartLockPasscodeStatus.PENDING,
    );
    if (pendingPasscodes.length > 0) {
      await Promise.all(
        pendingPasscodes.map((p) =>
          recoverPendingPasscodeViaDeviceList(credentials, p),
        ),
      );
      const stillPending = await prisma.smartLockPasscode.count({
        where: { status: SmartLockPasscodeStatus.PENDING },
      });
      if (stillPending > 0) {
        throw new DomainError(
          "発行処理中のパスコードが残っているため連携をクリアできません。しばらく待ってから再試行してください",
          "VALIDATION",
        );
      }

      const deviceIdsFromPending = Array.from(
        new Set(pendingPasscodes.map((p) => p.deviceId)),
      );
      const pendingRevokeConfirmed = await Promise.all(
        deviceIdsFromPending.map((deviceId) =>
          awaitDeviceRevokeConfirmation(deviceId),
        ),
      );
      if (!pendingRevokeConfirmed.every(Boolean)) {
        throw new DomainError(
          "失効処理が完了していないため連携をクリアできません。しばらく待ってから再試行してください",
          "VALIDATION",
        );
      }
    }

    const confirmedPasscodes = livePasscodes.filter(
      (p) => p.status === SmartLockPasscodeStatus.CONFIRMED,
    );
    if (confirmedPasscodes.length > 0) {
      const results = await Promise.all(
        confirmedPasscodes.map((p) =>
          revokeOne(credentials, {
            id: p.id,
            switchbotKeyId: p.switchbotKeyId,
            device: { deviceId: p.device.deviceId },
          }),
        ),
      );
      if (results.some((ok) => !ok)) {
        throw new DomainError(
          "一部のパスコードの失効に失敗したため連携をクリアできません。時間をおいて再試行してください",
          "VALIDATION",
        );
      }

      const deviceIds = Array.from(
        new Set(confirmedPasscodes.map((p) => p.deviceId)),
      );
      const allRevoked = await Promise.all(
        deviceIds.map((deviceId) => awaitDeviceRevokeConfirmation(deviceId)),
      );
      if (!allRevoked.every(Boolean)) {
        throw new DomainError(
          "失効処理が完了していないため連携をクリアできません。しばらく待ってから再試行してください",
          "VALIDATION",
        );
      }
    }

    const remainingLive = await prisma.smartLockPasscode.count({
      where: {
        status: {
          in: [
            SmartLockPasscodeStatus.PENDING,
            SmartLockPasscodeStatus.CONFIRMED,
            SmartLockPasscodeStatus.REVOKE_PENDING,
          ],
        },
      },
    });
    if (remainingLive > 0) {
      throw new DomainError(
        "未解決のパスコードが残っているため連携をクリアできません。しばらく待ってから再試行してください",
        "VALIDATION",
      );
    }

    // 資格情報が失われた後は二度とdeleteWebhookできず、SwitchBot側に古いwebhook登録が
    // 残り続けてしまうため、クリアする前にベストエフォートで解除しておく
    // （失敗してもクリア自体はブロックしない。既に未登録の場合もSwitchBot側がエラーを
    // 返すだけで実害は無い）。
    const { pathToken } = await getSwitchBotWebhookAuth();
    if (pathToken) {
      const url = `${getAppUrl()}/api/webhooks/switchbot/${pathToken}`;
      const result = await deleteWebhook(credentials, url);
      if (!result.ok) {
        logError(new Error("SwitchBot webhook解除に失敗しました"), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "clearSwitchBotSettings",
            message: result.message,
          },
        });
      }
    }
  }

  await upsertSwitchbotSettings({
    switchbotEnabled: false,
    switchbotOpenToken: null,
    switchbotSecretKey: null,
    switchbotWebhookPathToken: null,
    switchbotLastTestedAt: null,
    switchbotConnectionStatus: null,
  });
}

/**
 * Webhook URL難読化用トークンを取得する。未発行なら生成して保存してから返す
 * （webhook登録操作の直前に呼ぶことで、常に有効なトークンを保証する）。
 */
function generateSwitchBotWebhookPathToken(): string {
  return randomBytes(24).toString("base64url");
}

async function persistSwitchBotWebhookPathToken(token: string): Promise<void> {
  await upsertSwitchbotSettings({
    switchbotWebhookPathToken: encryptSecret(
      token,
      "Webhookトークンの暗号化に失敗しました",
      SETTINGS_CRYPTO_PURPOSES.switchbotWebhookPathToken,
    ),
  });
}

export type SwitchBotWebhookRegistrationStatus =
  "registered" | "not_registered" | "token_not_issued";

export async function getSwitchBotWebhookRegistrationStatus(): Promise<SwitchBotWebhookRegistrationStatus> {
  const credentials = await getDecryptedSwitchBotCredentials();
  if (!credentials) {
    throw new DomainError(
      "SwitchBot連携が未設定です。先にOpen Token/Secret Keyを保存してください",
      "VALIDATION",
    );
  }

  const { pathToken } = await getSwitchBotWebhookAuth();
  if (!pathToken) {
    return "token_not_issued";
  }

  const expectedUrl = `${getAppUrl()}/api/webhooks/switchbot/${pathToken}`;
  const result = await queryWebhookUrls(credentials);
  if (!result.ok) {
    throw new DomainError(
      `Webhook登録状態の確認に失敗しました: ${result.message}`,
      "UNEXPECTED",
    );
  }

  return result.body.urls.includes(expectedUrl)
    ? "registered"
    : "not_registered";
}

export async function ensureSwitchBotWebhookPathToken(): Promise<string> {
  const settings = await prisma.settingsSwitchbot.findUnique({
    where: { id: "singleton" },
    select: { switchbotWebhookPathToken: true },
  });

  const existing = safeDecryptToString(settings?.switchbotWebhookPathToken, {
    expectedPurpose: SETTINGS_CRYPTO_PURPOSES.switchbotWebhookPathToken,
  });
  if (existing) return existing;

  const token = generateSwitchBotWebhookPathToken();
  await persistSwitchBotWebhookPathToken(token);
  return token;
}

/**
 * Webhook URL難読化トークンをローテーションする。
 *
 * 1. 旧URLをSwitchBot側から解除（未登録/404系はベストエフォート）
 * 2. 新トークンを生成（既存値は再利用しない）
 * 3. DBを先に更新（旧パスは即無効）
 * 4. 新URLをSwitchBotへ登録
 *
 * 手順4が失敗しても旧トークンは復元しない。管理画面の「Webhookを登録」で再試行する。
 */
export async function rotateSwitchBotWebhookPathToken(): Promise<void> {
  const credentials = await getDecryptedSwitchBotCredentials();
  if (!credentials) {
    throw new DomainError(
      "SwitchBot連携が未設定です。先にOpen Token/Secret Keyを保存してください",
      "VALIDATION",
    );
  }

  const { pathToken: oldPathToken } = await getSwitchBotWebhookAuth();
  if (oldPathToken) {
    const oldUrl = `${getAppUrl()}/api/webhooks/switchbot/${oldPathToken}`;
    const deleteResult = await deleteWebhook(credentials, oldUrl);
    if (!deleteResult.ok) {
      logError(new Error("SwitchBot webhook解除に失敗しました"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "rotateSwitchBotWebhookPathToken",
          message: deleteResult.message,
        },
      });
    }
  }

  const newToken = generateSwitchBotWebhookPathToken();
  await persistSwitchBotWebhookPathToken(newToken);

  const newUrl = `${getAppUrl()}/api/webhooks/switchbot/${newToken}`;
  const setupResult = await setupWebhook(credentials, newUrl);
  if (!setupResult.ok) {
    throw new DomainError(
      "Webhook URLトークンの更新に失敗しました。管理画面の「Webhookを登録」から再試行してください",
      "UNEXPECTED",
    );
  }
}
