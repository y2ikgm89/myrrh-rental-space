"use server";

/**
 * スマートロックデバイス登録簿（設定 > 外部連携 > SwitchBot）用 Server Action。
 *
 * `_shared/actions/location-smart-lock-devices.ts` は特定 Location の編集画面に
 * 固定された旧経路（`resource: "location"`）。こちらは設定ページから拠点非依存で
 * 呼び出すための経路で、`locationId` は固定 bind ではなく `formData` から読み取る
 * （デバイスは `locationId` 必須 FK で Location に属するため、作成時にフォーム側で
 * 拠点を選択する）。RBAC は `resource: "settings"` / `action: "manage"`
 * （`SwitchBotSection.tsx` が使う既存 settings 系 action と同じリソース文字列）。
 */

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

const deviceIdSchema = uuidIdSchema("スマートロックデバイス");

/** スマートロックデバイスを登録する（フォームの `locationId` で拠点を指定）。 */
export async function createSmartLockDevice(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    smartLockDeviceFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "settings",
        action: "manage",
        execute: async () =>
          createSmartLockDeviceCommand(data.locationId, {
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

/**
 * スマートロックデバイスを更新する。
 *
 * `data.locationId` はフォーム上必須だが、`updateSmartLockDeviceCommand` が
 * 拠点の変更をサポートしないため無視される（拠点は作成時のみ確定）。
 */
export async function updateSmartLockDevice(
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
        resource: "settings",
        action: "manage",
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

/** スマートロックデバイスを削除する。 */
export async function deleteSmartLockDevice(
  deviceRowId: string,
): Promise<MutationResult<{ id: string }>> {
  const parsedDevice = deviceIdSchema.safeParse(deviceRowId);
  if (!parsedDevice.success) {
    return { error: "IDが不正です" };
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => deleteSmartLockDeviceCommand(parsedDevice.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACES);
    },
  });
}

/** スマートロックデバイスの有効/無効を切り替える。 */
export async function toggleSmartLockDeviceActive(
  deviceRowId: string,
  isActive: boolean,
): Promise<MutationResult<{ id: string; isActive: boolean }>> {
  const parsedDevice = deviceIdSchema.safeParse(deviceRowId);
  if (!parsedDevice.success) {
    return { error: "IDが不正です" };
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () =>
      toggleSmartLockDeviceActiveCommand(parsedDevice.data, isActive),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACES);
    },
  });
}
