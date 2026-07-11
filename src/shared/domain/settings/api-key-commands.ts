import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";
import { DomainError } from "@/shared/domain/domain-error";
import { encrypt, safeDecrypt } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import { SmartLockPasscodeStatus } from "@/shared/lib/validations/enums/prisma-types";
import type { CustomApiKeyInput } from "@/shared/types/api-keys";
import { parseCustomApiKeysMap } from "@/shared/domain/settings/api-key-helpers";
import {
  getDecryptedSwitchBotCredentials,
  getSwitchBotWebhookAuth,
} from "@/shared/domain/settings/api-key-queries";
import { revokeOne } from "@/shared/domain/smart-lock/revoke-passcode";
import { deleteWebhook } from "@/shared/lib/smart-lock/switchbot-client";
import { getAppUrl } from "@/shared/lib/constants";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

async function upsertSettings(
  updateData: Omit<Prisma.SettingsCreateInput, "id">,
): Promise<void> {
  await prisma.settings.upsert({
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
}): Promise<void> {
  const updateData: Omit<Prisma.SettingsCreateInput, "id"> = {};

  if (data.resendApiKey) {
    updateData.resendApiKey = encryptSecret(
      data.resendApiKey,
      "APIキーの暗号化に失敗しました",
      SETTINGS_CRYPTO_PURPOSES.resendApiKey,
    );
  }

  await upsertSettings(updateData);
}

export async function recordResendConnectionStatus(
  status: "connected" | "error",
): Promise<void> {
  await upsertSettings({
    resendLastTestedAt: new Date(),
    resendConnectionStatus: status,
  });
}

export async function clearResendSettings(): Promise<void> {
  await upsertSettings({
    resendApiKey: null,
    resendLastTestedAt: null,
    resendConnectionStatus: null,
  });
}

export async function updateTurnstileSettings(data: {
  turnstileSiteKey?: string | null;
  turnstileSecretKey?: string | null;
}): Promise<void> {
  const updateData: Omit<Prisma.SettingsCreateInput, "id"> = {};

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

  await upsertSettings(updateData);
}

export async function recordTurnstileConnectionStatus(
  status: "connected" | "error",
): Promise<void> {
  await upsertSettings({
    turnstileLastTestedAt: new Date(),
    turnstileConnectionStatus: status,
  });
}

export async function clearTurnstileSettings(): Promise<void> {
  await upsertSettings({
    turnstileSiteKey: null,
    turnstileSecretKey: null,
    turnstileLastTestedAt: null,
    turnstileConnectionStatus: null,
  });
}

export async function updateGoogleMapsSettings(data: {
  googleMapsApiKey?: string | null;
}): Promise<void> {
  const updateData: Omit<Prisma.SettingsCreateInput, "id"> = {};

  if (data.googleMapsApiKey) {
    updateData.googleMapsApiKey = encryptSecret(
      data.googleMapsApiKey,
      "APIキーの暗号化に失敗しました",
      SETTINGS_CRYPTO_PURPOSES.googleMapsApiKey,
    );
  }

  await upsertSettings(updateData);
}

export async function recordGoogleMapsConnectionStatus(
  status: "connected" | "error",
): Promise<void> {
  await upsertSettings({
    googleMapsLastTestedAt: new Date(),
    googleMapsConnectionStatus: status,
  });
}

export async function clearGoogleMapsSettings(): Promise<void> {
  await upsertSettings({
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
  const updateData: Omit<Prisma.SettingsCreateInput, "id"> = {};

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

  await upsertSettings(updateData);
}

export async function recordSwitchBotConnectionStatus(
  status: "connected" | "error",
): Promise<void> {
  await upsertSettings({
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
  const credentials = await getDecryptedSwitchBotCredentials();
  // 資格情報が既に復号できない（無効化済み・未設定等）場合はこれ以上できることが
  // 無いため、そのままクリアを許可する。
  if (credentials) {
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
        status: true,
        switchbotKeyId: true,
        device: { select: { deviceId: true } },
      },
    });

    if (
      livePasscodes.some((p) => p.status === SmartLockPasscodeStatus.PENDING)
    ) {
      throw new DomainError(
        "発行処理中のパスコードが残っているため連携をクリアできません。しばらく待ってから再試行してください",
        "VALIDATION",
      );
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

  await upsertSettings({
    switchbotEnabled: false,
    switchbotOpenToken: null,
    switchbotSecretKey: null,
    switchbotLastTestedAt: null,
    switchbotConnectionStatus: null,
  });
}

/**
 * Webhook URL難読化用トークンを取得する。未発行なら生成して保存してから返す
 * （webhook登録操作の直前に呼ぶことで、常に有効なトークンを保証する）。
 */
export async function ensureSwitchBotWebhookPathToken(): Promise<string> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { switchbotWebhookPathToken: true },
  });

  const existing = settings?.switchbotWebhookPathToken
    ? (safeDecrypt(settings.switchbotWebhookPathToken, {
        expectedPurpose: SETTINGS_CRYPTO_PURPOSES.switchbotWebhookPathToken,
      })?.toString("utf8") ?? null)
    : null;
  if (existing) return existing;

  const token = randomBytes(24).toString("base64url");
  await upsertSettings({
    switchbotWebhookPathToken: encryptSecret(
      token,
      "Webhookトークンの暗号化に失敗しました",
      SETTINGS_CRYPTO_PURPOSES.switchbotWebhookPathToken,
    ),
  });
  return token;
}

export async function addCustomApiKey(
  data: CustomApiKeyInput,
): Promise<{ id: string }> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { customApiKeys: true },
  });

  const existing = parseCustomApiKeysMap(settings?.customApiKeys);
  const id = randomUUID();
  const now = new Date().toISOString();
  const encryptedKeyValue = encryptSecret(
    data.keyValue,
    "APIキーの暗号化に失敗しました",
    SETTINGS_CRYPTO_PURPOSES.customApiKey,
  );

  const updated = {
    ...existing,
    [id]: {
      name: data.name,
      keyName: data.keyName,
      keyValue: encryptedKeyValue,
      description: data.description,
      createdAt: now,
      updatedAt: now,
    },
  };

  await upsertSettings({ customApiKeys: updated });

  return { id };
}

export async function deleteCustomApiKey(id: string): Promise<void> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { customApiKeys: true },
  });

  const existing = parseCustomApiKeysMap(settings?.customApiKeys);
  if (!existing[id]) {
    throw new DomainError("指定されたAPIキーが見つかりません", "NOT_FOUND");
  }

  const { [id]: _removed, ...rest } = existing;

  await upsertSettings({ customApiKeys: rest });
}
