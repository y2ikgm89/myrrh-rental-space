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

const spaceIdSchema = uuidIdSchema("スペース");
const deviceIdSchema = uuidIdSchema("スマートロックデバイス");

/** スペースにスマートロックデバイスを追加する。 */
export async function createSpaceSmartLockDevice(
  spaceId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    smartLockDeviceFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "space",
        action: "update",
        resourceId: spaceId,
        execute: async () =>
          createSmartLockDeviceCommand(spaceId, {
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

/** スペースのスマートロックデバイスを更新する。 */
export async function updateSpaceSmartLockDevice(
  spaceId: string,
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
        resource: "space",
        action: "update",
        resourceId: spaceId,
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

/** スペースのスマートロックデバイスを削除する。 */
export async function deleteSpaceSmartLockDevice(
  spaceId: string,
  deviceRowId: string,
): Promise<MutationResult<{ id: string }>> {
  const parsedSpace = spaceIdSchema.safeParse(spaceId);
  const parsedDevice = deviceIdSchema.safeParse(deviceRowId);
  if (!parsedSpace.success || !parsedDevice.success) {
    return { error: "IDが不正です" };
  }

  return executeAdminMutationResult({
    resource: "space",
    action: "update",
    resourceId: parsedSpace.data,
    execute: async () => deleteSmartLockDeviceCommand(parsedDevice.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACES);
    },
  });
}

/** スペースのスマートロックデバイスの有効/無効を切り替える。 */
export async function toggleSpaceSmartLockDeviceActive(
  spaceId: string,
  deviceRowId: string,
  isActive: boolean,
): Promise<MutationResult<{ id: string; isActive: boolean }>> {
  const parsedSpace = spaceIdSchema.safeParse(spaceId);
  const parsedDevice = deviceIdSchema.safeParse(deviceRowId);
  if (!parsedSpace.success || !parsedDevice.success) {
    return { error: "IDが不正です" };
  }

  return executeAdminMutationResult({
    resource: "space",
    action: "update",
    resourceId: parsedSpace.data,
    execute: async () =>
      toggleSmartLockDeviceActiveCommand(parsedDevice.data, isActive),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACES);
    },
  });
}
