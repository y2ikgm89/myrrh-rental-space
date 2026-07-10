import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";
import { DomainError } from "@/shared/domain/domain-error";
import { encrypt, safeDecrypt } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import type { CustomApiKeyInput } from "@/shared/types/api-keys";
import { parseCustomApiKeysMap } from "@/shared/domain/settings/api-key-helpers";

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

export async function clearSwitchBotSettings(): Promise<void> {
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
    ? safeDecrypt(settings.switchbotWebhookPathToken)
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
