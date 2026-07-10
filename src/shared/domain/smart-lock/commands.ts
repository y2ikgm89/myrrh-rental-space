import "server-only";

import { Prisma } from "@generated/prisma/client";
import type { SmartLockDeviceType } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function ensureSpaceExists(spaceId: string): Promise<void> {
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { id: true },
  });
  if (!space) {
    throw new DomainError("スペースが見つかりません", "NOT_FOUND");
  }
}

async function ensureSmartLockDeviceExists(id: string): Promise<void> {
  const existing = await prisma.smartLockDevice.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    throw new DomainError(
      "スマートロックデバイスが見つかりません",
      "NOT_FOUND",
    );
  }
}

/**
 * `deviceId`（SwitchBot 側 device ID / MAC アドレス）の一意制約違反を
 * `DomainError("DUPLICATE")` に変換する。
 */
async function withDuplicateDeviceIdGuard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DomainError(
        "同じデバイスID（MACアドレス）のスマートロックが既に登録されています",
        "DUPLICATE",
      );
    }
    throw error;
  }
}

export type SmartLockDeviceCommandInput = {
  deviceId: string;
  deviceName: string;
  deviceType: SmartLockDeviceType;
  isActive: boolean;
};

export async function createSmartLockDeviceCommand(
  spaceId: string,
  data: SmartLockDeviceCommandInput,
): Promise<{ id: string }> {
  await ensureSpaceExists(spaceId);

  return withDuplicateDeviceIdGuard(async () => {
    const created = await prisma.smartLockDevice.create({
      data: {
        spaceId,
        deviceId: data.deviceId,
        deviceName: data.deviceName,
        deviceType: data.deviceType,
        isActive: data.isActive,
      },
      select: { id: true },
    });
    return { id: created.id };
  });
}

export async function updateSmartLockDeviceCommand(
  id: string,
  data: SmartLockDeviceCommandInput,
): Promise<{ id: string }> {
  await ensureSmartLockDeviceExists(id);

  return withDuplicateDeviceIdGuard(async () => {
    await prisma.smartLockDevice.update({
      where: { id },
      data: {
        deviceId: data.deviceId,
        deviceName: data.deviceName,
        deviceType: data.deviceType,
        isActive: data.isActive,
      },
    });
    return { id };
  });
}

export async function deleteSmartLockDeviceCommand(
  id: string,
): Promise<{ id: string }> {
  await ensureSmartLockDeviceExists(id);

  await prisma.smartLockDevice.delete({ where: { id } });

  return { id };
}

export async function toggleSmartLockDeviceActiveCommand(
  id: string,
  isActive: boolean,
): Promise<{ id: string; isActive: boolean }> {
  await ensureSmartLockDeviceExists(id);

  await prisma.smartLockDevice.update({
    where: { id },
    data: { isActive },
  });

  return { id, isActive };
}
