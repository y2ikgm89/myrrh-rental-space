"use client";

import { LocationDefaultSmartLockDeviceCard } from "@/admin/components/LocationDefaultSmartLockDeviceCard";
import type { LocationSmartLockDevicesTabProps } from "./types";

export function LocationSmartLockDevicesTab({
  locationId,
  defaultSmartLockDeviceId,
  initialSmartLockDevices,
}: LocationSmartLockDevicesTabProps) {
  return (
    <LocationDefaultSmartLockDeviceCard
      locationId={locationId}
      initialDeviceId={defaultSmartLockDeviceId}
      availableDevices={initialSmartLockDevices}
    />
  );
}
