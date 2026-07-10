import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { SmartLockDeviceType } from "@generated/prisma/enums";
import type { SmartLockDeviceData } from "@/shared/domain/smart-lock/types";

const SMART_LOCK_DEVICE_SELECT = {
  id: true,
  locationId: true,
  deviceId: true,
  deviceName: true,
  deviceType: true,
  isActive: true,
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 当該拠点に登録されたスマートロックデバイス一覧（登録簿管理タブ用、登録順） */
export async function getSmartLockDevicesForLocation(
  locationId: string,
): Promise<SmartLockDeviceData[]> {
  const rows = await prisma.smartLockDevice.findMany({
    where: { locationId },
    orderBy: { createdAt: "asc" },
    select: SMART_LOCK_DEVICE_SELECT,
  });
  return rows.map(formatSmartLockDevice);
}
