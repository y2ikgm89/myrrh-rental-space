import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";
import { DomainError } from "@/shared/domain/domain-error";
import { encrypt } from "@/shared/lib/crypto";
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

function encryptSecret(value: string, message: string): string {
  try {
    return encrypt(value);
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
