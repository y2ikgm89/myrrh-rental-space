import "server-only";

import { Prisma } from "@generated/prisma/client";
import type { SmartLockDeviceType } from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import {
  getDecryptedSwitchBotCredentials,
  getDecryptedSwitchBotCredentialsForRevocation,
} from "@/shared/domain/settings/api-key-queries";
import {
  awaitDeviceRevokeConfirmation,
  revokeOne,
} from "@/shared/domain/smart-lock/revoke-passcode";
import {
  getDeviceListCached,
  getLockDeviceStatus,
} from "@/shared/lib/smart-lock/switchbot-client";
import { SmartLockPasscodeStatus } from "@/shared/lib/validations/enums/prisma-types";
import {
  isSmartLockBodyDeviceType,
  isSmartLockPadDeviceType,
  SMART_LOCK_BODY_DEVICE_TYPES,
} from "@/shared/lib/validations/enums/helpers";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function normalizeLockState(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "LOCKED" ||
    normalized === "UNLOCKED" ||
    normalized === "JAMMED"
  ) {
    return normalized;
  }
  return null;
}

function normalizeDoorState(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (normalized === "OPEN") {
    return "OPEN";
  }
  if (normalized === "CLOSE" || normalized === "CLOSED") {
    return "CLOSE";
  }
  return null;
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

async function validatePairedLockDeviceId(
  locationId: string,
  pairedLockDeviceId: string,
): Promise<void> {
  const pairedLock = await prisma.smartLockDevice.findUnique({
    where: { id: pairedLockDeviceId },
    select: { id: true, locationId: true, deviceType: true },
  });
  if (!pairedLock) {
    throw new DomainError("ペア錠デバイスが見つかりません", "NOT_FOUND");
  }
  if (pairedLock.locationId !== locationId) {
    throw new DomainError(
      "ペア錠は同じ拠点に登録された錠デバイスを指定してください",
      "VALIDATION",
    );
  }
  if (!isSmartLockBodyDeviceType(pairedLock.deviceType)) {
    throw new DomainError(
      "ペア錠には Lock / Lock Lite / Lock Pro のいずれかを指定してください",
      "VALIDATION",
    );
  }
}

async function resolveAutoPairedLockDeviceId(
  locationId: string,
  padSwitchbotDeviceId: string,
): Promise<string | null> {
  const credentials = await getDecryptedSwitchBotCredentials();
  if (!credentials) {
    return null;
  }

  const listResult = await getDeviceListCached(credentials);
  if (!listResult.ok) {
    return null;
  }

  const padItem = listResult.body.deviceList.find(
    (item) => item.deviceId === padSwitchbotDeviceId,
  );
  if (!padItem?.lockDeviceId) {
    return null;
  }

  const bodyDevice = await prisma.smartLockDevice.findFirst({
    where: {
      locationId,
      deviceId: padItem.lockDeviceId,
      deviceType: { in: [...SMART_LOCK_BODY_DEVICE_TYPES] },
    },
    select: { id: true },
  });
  return bodyDevice?.id ?? null;
}

function assertPadOnlyAssignment(deviceType: SmartLockDeviceType): void {
  if (!isSmartLockPadDeviceType(deviceType)) {
    throw new DomainError(
      "スペースまたは拠点既定に割り当てできるのは Keypad 系デバイスのみです",
      "VALIDATION",
    );
  }
}

async function resolvePairedLockDeviceIdForCreate(
  locationId: string,
  data: SmartLockDeviceCommandInput,
): Promise<string | null> {
  if (!isSmartLockPadDeviceType(data.deviceType)) {
    if (data.pairedLockDeviceId) {
      throw new DomainError(
        "錠デバイスにはペア錠を設定できません",
        "VALIDATION",
      );
    }
    return null;
  }

  if (data.pairedLockDeviceId) {
    await validatePairedLockDeviceId(locationId, data.pairedLockDeviceId);
    return data.pairedLockDeviceId;
  }

  return resolveAutoPairedLockDeviceId(locationId, data.deviceId);
}

async function resolvePairedLockDeviceIdForUpdate(
  locationId: string,
  data: SmartLockDeviceCommandInput,
): Promise<string | null | undefined> {
  if (!isSmartLockPadDeviceType(data.deviceType)) {
    if (data.pairedLockDeviceId) {
      throw new DomainError(
        "錠デバイスにはペア錠を設定できません",
        "VALIDATION",
      );
    }
    return null;
  }

  if (data.pairedLockDeviceId === undefined) {
    return undefined;
  }

  if (data.pairedLockDeviceId === null) {
    return null;
  }

  await validatePairedLockDeviceId(locationId, data.pairedLockDeviceId);
  return data.pairedLockDeviceId;
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
  pairedLockDeviceId?: string | null;
};

export type SmartLockDeviceStateSnapshot = {
  readonly id: string;
  readonly lastLockState: string | null;
  readonly lastDoorState: string | null;
  readonly lastBattery: number | null;
  readonly lastStateAt: string;
};

export async function createSmartLockDeviceCommand(
  locationId: string,
  data: SmartLockDeviceCommandInput,
): Promise<{ id: string }> {
  await ensureLocationExists(locationId);
  const pairedLockDeviceId = await resolvePairedLockDeviceIdForCreate(
    locationId,
    data,
  );

  return withDuplicateDeviceIdGuard(async () => {
    const created = await prisma.smartLockDevice.create({
      data: {
        locationId,
        deviceId: data.deviceId,
        deviceName: data.deviceName,
        deviceType: data.deviceType,
        isActive: data.isActive,
        pairedLockDeviceId,
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
  const existing = await prisma.smartLockDevice.findUnique({
    where: { id },
    select: { id: true, locationId: true },
  });
  if (!existing) {
    throw new DomainError(
      "スマートロックデバイスが見つかりません",
      "NOT_FOUND",
    );
  }

  const pairedLockDeviceId = await resolvePairedLockDeviceIdForUpdate(
    existing.locationId,
    data,
  );

  return withDuplicateDeviceIdGuard(async () => {
    await prisma.smartLockDevice.update({
      where: { id },
      data: {
        deviceId: data.deviceId,
        deviceName: data.deviceName,
        deviceType: data.deviceType,
        isActive: data.isActive,
        ...(pairedLockDeviceId !== undefined && { pairedLockDeviceId }),
      },
    });
    return { id };
  });
}

export async function refreshLockDeviceStateCommand(
  deviceRowId: string,
): Promise<SmartLockDeviceStateSnapshot> {
  const device = await prisma.smartLockDevice.findUnique({
    where: { id: deviceRowId },
    select: {
      id: true,
      deviceId: true,
      deviceType: true,
    },
  });
  if (!device) {
    throw new DomainError(
      "スマートロックデバイスが見つかりません",
      "NOT_FOUND",
    );
  }
  if (!isSmartLockBodyDeviceType(device.deviceType)) {
    throw new DomainError(
      "状態更新は Lock / Lock Lite / Lock Pro のみ対象です",
      "VALIDATION",
    );
  }

  const credentials = await getDecryptedSwitchBotCredentials();
  if (!credentials) {
    throw new DomainError(
      "SwitchBot 連携が無効または未設定のため状態を取得できません",
      "VALIDATION",
    );
  }

  const statusResult = await getLockDeviceStatus(credentials, device.deviceId);
  if (!statusResult.ok) {
    throw new DomainError(
      statusResult.message || "SwitchBot から状態を取得できませんでした",
      "VALIDATION",
    );
  }

  const lastLockState =
    statusResult.body.lockState !== undefined
      ? normalizeLockState(statusResult.body.lockState)
      : null;
  const supportsDoorState = device.deviceType !== "LOCK_LITE";
  const lastDoorState =
    supportsDoorState && statusResult.body.doorState !== undefined
      ? normalizeDoorState(statusResult.body.doorState)
      : null;
  const lastBattery =
    statusResult.body.battery !== undefined ? statusResult.body.battery : null;
  const lastStateAt = new Date();

  await prisma.smartLockDevice.update({
    where: { id: device.id },
    data: {
      lastLockState,
      lastDoorState,
      lastBattery,
      lastStateAt,
    },
  });

  return {
    id: device.id,
    lastLockState,
    lastDoorState,
    lastBattery,
    lastStateAt: lastStateAt.toISOString(),
  };
}

/**
 * デバイス削除前に、このデバイスに紐づく生きたパスコードを失効させ、
 * key 消失が確認できてから削除する。`SmartLockPasscode.device`はonDelete: Cascade
 * のため、REVOKE_PENDING のまま cascade すると物理 key の deleteKey 追跡が失われる。
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

  const revocationCredentials =
    await getDecryptedSwitchBotCredentialsForRevocation();

  const pendingPasscodes = await prisma.smartLockPasscode.findMany({
    where: {
      deviceId: id,
      status: SmartLockPasscodeStatus.PENDING,
    },
    select: { id: true },
  });
  if (pendingPasscodes.length > 0) {
    throw new DomainError(
      "発行処理中のパスコードが残っているため削除できません。しばらく待ってから再試行してください",
      "VALIDATION",
    );
  }

  const livePasscodes = await prisma.smartLockPasscode.findMany({
    where: {
      deviceId: id,
      status: {
        in: [
          SmartLockPasscodeStatus.CONFIRMED,
          SmartLockPasscodeStatus.REVOKE_PENDING,
        ],
      },
    },
    select: { id: true, status: true, switchbotKeyId: true },
  });

  if (
    livePasscodes.some(
      (p) => p.status === SmartLockPasscodeStatus.REVOKE_PENDING,
    )
  ) {
    if (!revocationCredentials) {
      throw new DomainError(
        "失効処理中のパスコードが残っているため削除できません。SwitchBot連携が無効/未設定のため失効確認できません",
        "VALIDATION",
      );
    }
    const confirmed = await awaitDeviceRevokeConfirmation(id);
    if (!confirmed) {
      throw new DomainError(
        "失効処理が完了していないため削除できません。しばらく待ってから再試行してください",
        "VALIDATION",
      );
    }
  }

  const confirmedPasscodes = livePasscodes.filter(
    (p) => p.status === SmartLockPasscodeStatus.CONFIRMED,
  );
  if (confirmedPasscodes.length > 0) {
    if (!revocationCredentials) {
      throw new DomainError(
        "有効なパスコードが残っているため削除できません（SwitchBot連携が無効/未設定のため失効できません）",
        "VALIDATION",
      );
    }

    const results = await Promise.all(
      confirmedPasscodes.map((passcode) =>
        revokeOne(revocationCredentials, {
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

    const allRevoked = await awaitDeviceRevokeConfirmation(id);
    if (!allRevoked) {
      throw new DomainError(
        "失効処理が完了していないため削除できません。しばらく待ってから再試行してください",
        "VALIDATION",
      );
    }
  }

  const remainingLive = await prisma.smartLockPasscode.count({
    where: {
      deviceId: id,
      status: {
        in: [
          SmartLockPasscodeStatus.CONFIRMED,
          SmartLockPasscodeStatus.PENDING,
          SmartLockPasscodeStatus.REVOKE_PENDING,
        ],
      },
    },
  });
  if (remainingLive > 0) {
    throw new DomainError(
      "未解決のパスコードが残っているため削除できません。しばらく待ってから再試行してください",
      "VALIDATION",
    );
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
        select: { id: true, locationId: true, deviceType: true },
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
      assertPadOnlyAssignment(device.deviceType);
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
      select: { id: true, locationId: true, deviceType: true },
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
    assertPadOnlyAssignment(device.deviceType);
  }

  await prisma.location.update({
    where: { id: locationId },
    data: { defaultSmartLockDeviceId: deviceId },
  });

  return { id: locationId, defaultSmartLockDeviceId: deviceId };
}
