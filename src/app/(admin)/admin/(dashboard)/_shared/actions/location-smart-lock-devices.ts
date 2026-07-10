"use server";

import type { SubmissionResult } from "@conform-to/react";
import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { CACHE_TAGS } from "@/shared/lib/constants";
import {
  createSmartLockDeviceCommand,
  updateSmartLockDeviceCommand,
  deleteSmartLockDeviceCommand,
  toggleSmartLockDeviceActiveCommand,
} from "@/shared/domain/smart-lock/commands";
import { smartLockDeviceFormSchema } from "@/admin/lib/validations/smart-lock-device";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const locationIdSchema = uuidIdSchema("拠点");
const deviceIdSchema = uuidIdSchema("スマートロックデバイス");

/** 拠点にスマートロックデバイスを追加する。 */
export async function createLocationSmartLockDevice(
  locationId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    smartLockDeviceFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "location",
        action: "update",
        resourceId: locationId,
        execute: async () =>
          createSmartLockDeviceCommand(locationId, {
            deviceId: data.deviceId,
            deviceName: data.deviceName,
            deviceType: data.deviceType,
            isActive: data.isActive,
          }),
        afterSuccess: () => {
          updateTag(CACHE_TAGS.SPACES);
        },
      });

      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

/** 拠点のスマートロックデバイスを更新する。 */
export async function updateLocationSmartLockDevice(
  locationId: string,
  deviceRowId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    smartLockDeviceFormSchema,
    async (data) => {
      const parsedDevice = deviceIdSchema.safeParse(deviceRowId);
      if (!parsedDevice.success) {
        return { ok: false, error: "IDが不正です" };
      }

      const result = await executeAdminMutationResult({
        resource: "location",
        action: "update",
        resourceId: locationId,
        execute: async () =>
          updateSmartLockDeviceCommand(parsedDevice.data, {
            deviceId: data.deviceId,
            deviceName: data.deviceName,
            deviceType: data.deviceType,
            isActive: data.isActive,
          }),
        afterSuccess: () => {
          updateTag(CACHE_TAGS.SPACES);
        },
      });

      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

/** 拠点のスマートロックデバイスを削除する。 */
export async function deleteLocationSmartLockDevice(
  locationId: string,
  deviceRowId: string,
): Promise<MutationResult<{ id: string }>> {
  const parsedLocation = locationIdSchema.safeParse(locationId);
  const parsedDevice = deviceIdSchema.safeParse(deviceRowId);
  if (!parsedLocation.success || !parsedDevice.success) {
    return { error: "IDが不正です" };
  }

  return executeAdminMutationResult({
    resource: "location",
    action: "update",
    resourceId: parsedLocation.data,
    execute: async () => deleteSmartLockDeviceCommand(parsedDevice.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACES);
    },
  });
}

/** 拠点のスマートロックデバイスの有効/無効を切り替える。 */
export async function toggleLocationSmartLockDeviceActive(
  locationId: string,
  deviceRowId: string,
  isActive: boolean,
): Promise<MutationResult<{ id: string; isActive: boolean }>> {
  const parsedLocation = locationIdSchema.safeParse(locationId);
  const parsedDevice = deviceIdSchema.safeParse(deviceRowId);
  if (!parsedLocation.success || !parsedDevice.success) {
    return { error: "IDが不正です" };
  }

  return executeAdminMutationResult({
    resource: "location",
    action: "update",
    resourceId: parsedLocation.data,
    execute: async () =>
      toggleSmartLockDeviceActiveCommand(parsedDevice.data, isActive),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACES);
    },
  });
}
