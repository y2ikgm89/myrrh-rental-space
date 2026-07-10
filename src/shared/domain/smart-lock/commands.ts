import "server-only";

import { Prisma } from "@generated/prisma/client";
import type { SmartLockDeviceType } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { getDecryptedSwitchBotCredentials } from "@/shared/domain/settings/api-key-queries";
import { revokeOne } from "@/shared/domain/smart-lock/revoke-passcode";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function ensureLocationExists(locationId: string): Promise<void> {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true },
  });
  if (!location) {
    throw new DomainError("拠点が見つかりません", "NOT_FOUND");
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
  locationId: string,
  data: SmartLockDeviceCommandInput,
): Promise<{ id: string }> {
  await ensureLocationExists(locationId);

  return withDuplicateDeviceIdGuard(async () => {
    const created = await prisma.smartLockDevice.create({
      data: {
        locationId,
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

/**
 * デバイス削除前に、このデバイスに紐づく生きたパスコード（PENDING/CONFIRMED）を
 * 失効させる。`SmartLockPasscode.device`はonDelete: Cascadeのため、これをせずに
 * 削除すると、まだ物理ドアで有効なパスコードのkeyId/deviceId対応が失われ、
 * 二度とdeleteKeyできなくなる（ゲストの暗証番号が失効不能なまま残る）。
 */
export async function deleteSmartLockDeviceCommand(
  id: string,
): Promise<{ id: string }> {
  const device = await prisma.smartLockDevice.findUnique({
    where: { id },
    select: { id: true, deviceId: true },
  });
  if (!device) {
    throw new DomainError(
      "スマートロックデバイスが見つかりません",
      "NOT_FOUND",
    );
  }

  const livePasscodes = await prisma.smartLockPasscode.findMany({
    where: { deviceId: id, status: { in: ["PENDING", "CONFIRMED"] } },
    select: { id: true, status: true, switchbotKeyId: true },
  });

  if (livePasscodes.some((p) => p.status === "PENDING")) {
    throw new DomainError(
      "発行処理中のパスコードが残っているため削除できません。しばらく待ってから再試行してください",
      "VALIDATION",
    );
  }

  const confirmedPasscodes = livePasscodes.filter(
    (p) => p.status === "CONFIRMED",
  );
  if (confirmedPasscodes.length > 0) {
    const credentials = await getDecryptedSwitchBotCredentials();
    if (!credentials) {
      throw new DomainError(
        "有効なパスコードが残っているため削除できません（SwitchBot連携が無効/未設定のため失効できません）",
        "VALIDATION",
      );
    }

    const results = await Promise.all(
      confirmedPasscodes.map((passcode) =>
        revokeOne(credentials, {
          id: passcode.id,
          switchbotKeyId: passcode.switchbotKeyId,
          device: { deviceId: device.deviceId },
        }),
      ),
    );
    if (results.some((ok) => !ok)) {
      throw new DomainError(
        "一部のパスコードの失効に失敗したため削除できません。時間をおいて再試行してください",
        "VALIDATION",
      );
    }
  }

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

/**
 * スペースに割り当てるスマートロックデバイスを設定する（`null`で解除）。
 * 同一デバイスを複数スペースに設定できる（物理ロック共有のため制約なし）。
 */
export async function setSpaceSmartLockDeviceCommand(
  spaceId: string,
  deviceId: string | null,
): Promise<{ id: string; smartLockDeviceId: string | null }> {
  return prisma.$transaction(async (tx) => {
    // updateSpaceCommand の拠点変更判定（同じ 728352 lock namespace）と直列化する。
    // ロックなしでは、この読取と update の間に拠点変更が挟まった場合、
    // 異なる拠点のデバイスが残ってしまう（Codexレビュー指摘 P2, PR#929）。
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728352::int4, hashtext(${spaceId}))`;

    const space = await tx.space.findUnique({
      where: { id: spaceId },
      select: { id: true, locationId: true },
    });
    if (!space) {
      throw new DomainError("スペースが見つかりません", "NOT_FOUND");
    }

    if (deviceId) {
      const device = await tx.smartLockDevice.findUnique({
        where: { id: deviceId },
        select: { id: true, locationId: true },
      });
      if (!device) {
        throw new DomainError(
          "スマートロックデバイスが見つかりません",
          "NOT_FOUND",
        );
      }
      // デバイスはLocation所有のため、スペースと異なる拠点のデバイスを割り当てると
      // issueSmartLockPasscodesが誤った物理ドアへパスコードを発行してしまう。
      if (device.locationId !== space.locationId) {
        throw new DomainError(
          "このデバイスはスペースと異なる拠点に登録されています",
          "VALIDATION",
        );
      }
    }

    await tx.space.update({
      where: { id: spaceId },
      data: { smartLockDeviceId: deviceId },
    });

    return { id: spaceId, smartLockDeviceId: deviceId };
  });
}

/**
 * 拠点の既定スマートロックデバイスを設定する（`null`で解除）。
 * 新規Space作成時にSpace.smartLockDeviceIdの初期値としてここから継承される。
 */
export async function setLocationDefaultSmartLockDeviceCommand(
  locationId: string,
  deviceId: string | null,
): Promise<{ id: string; defaultSmartLockDeviceId: string | null }> {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true },
  });
  if (!location) {
    throw new DomainError("拠点が見つかりません", "NOT_FOUND");
  }

  if (deviceId) {
    const device = await prisma.smartLockDevice.findUnique({
      where: { id: deviceId },
      select: { id: true, locationId: true },
    });
    if (!device) {
      throw new DomainError(
        "スマートロックデバイスが見つかりません",
        "NOT_FOUND",
      );
    }
    if (device.locationId !== locationId) {
      throw new DomainError(
        "このデバイスは異なる拠点に登録されています",
        "VALIDATION",
      );
    }
  }

  await prisma.location.update({
    where: { id: locationId },
    data: { defaultSmartLockDeviceId: deviceId },
  });

  return { id: locationId, defaultSmartLockDeviceId: deviceId };
}
