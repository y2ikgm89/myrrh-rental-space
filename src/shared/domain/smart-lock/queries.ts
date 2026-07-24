import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { SmartLockDeviceType } from "@generated/prisma/enums";
import type { SmartLockDeviceData } from "@/shared/domain/smart-lock/types";
import { SMART_LOCK_PAD_DEVICE_TYPES } from "@/shared/lib/validations/enums/helpers";

const SMART_LOCK_DEVICE_SELECT = {
  id: true,
  locationId: true,
  deviceId: true,
  deviceName: true,
  deviceType: true,
  isActive: true,
  pairedLockDeviceId: true,
  lastLockState: true,
  lastDoorState: true,
  lastBattery: true,
  lastStateAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function formatSmartLockDevice(row: {
  id: string;
  locationId: string;
  deviceId: string;
  deviceName: string;
  deviceType: SmartLockDeviceType;
  isActive: boolean;
  pairedLockDeviceId: string | null;
  lastLockState: string | null;
  lastDoorState: string | null;
  lastBattery: number | null;
  lastStateAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): SmartLockDeviceData {
  return {
    id: row.id,
    locationId: row.locationId,
    deviceId: row.deviceId,
    deviceName: row.deviceName,
    deviceType: row.deviceType,
    isActive: row.isActive,
    pairedLockDeviceId: row.pairedLockDeviceId,
    lastLockState: row.lastLockState,
    lastDoorState: row.lastDoorState,
    lastBattery: row.lastBattery,
    lastStateAt: row.lastStateAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 拠点の既定デバイス選択用。パッド（KEYPAD*）のみ。 */
export async function getSmartLockDevicesForLocation(
  locationId: string,
): Promise<SmartLockDeviceData[]> {
  const rows = await prisma.smartLockDevice.findMany({
    where: {
      locationId,
      deviceType: { in: [...SMART_LOCK_PAD_DEVICE_TYPES] },
    },
    orderBy: { createdAt: "asc" },
    select: SMART_LOCK_DEVICE_SELECT,
  });
  return rows.map(formatSmartLockDevice);
}

export type SmartLockDeviceWithLocation = SmartLockDeviceData & {
  readonly locationName: string;
};

/** 全拠点横断のスマートロックデバイス一覧（設定ページの登録簿管理用、拠点名付き） */
export async function getAllSmartLockDevices(): Promise<
  SmartLockDeviceWithLocation[]
> {
  const rows = await prisma.smartLockDevice.findMany({
    orderBy: [{ locationId: "asc" }, { createdAt: "asc" }],
    select: {
      ...SMART_LOCK_DEVICE_SELECT,
      location: { select: { name: true } },
    },
  });
  return rows.map((row) => ({
    ...formatSmartLockDevice(row),
    locationName: row.location.name,
  }));
}
