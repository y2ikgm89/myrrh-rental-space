"use server";

import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { setLocationDefaultSmartLockDeviceCommand } from "@/shared/domain/smart-lock/commands";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const locationIdSchema = uuidIdSchema("拠点");
const deviceIdSchema = uuidIdSchema("スマートロックデバイス").nullable();

/**
 * 拠点の既定スマートロックデバイスを設定する（`deviceId` に `null` を渡すと解除）。
 *
 * 登録簿（同一 Location 配下の SmartLockDevice）から最大 1 台を既定として選ぶだけの
 * シンプルな参照更新のため、conform の FormData 経由ではなく直接引数で呼び出す
 * （`setSpaceSmartLockDevice` と同じパターン）。デバイスの登録・編集・削除は
 * 設定ページ（外部連携 > SwitchBot）で行う。
 */
export async function setLocationDefaultSmartLockDevice(
  locationId: string,
  deviceId: string | null,
): Promise<
  MutationResult<{ id: string; defaultSmartLockDeviceId: string | null }>
> {
  const parsedLocation = locationIdSchema.safeParse(locationId);
  const parsedDevice = deviceIdSchema.safeParse(deviceId);
  if (!parsedLocation.success || !parsedDevice.success) {
    return { error: "IDが不正です" };
  }

  return executeAdminMutationResult({
    resource: "location",
    action: "update",
    resourceId: parsedLocation.data,
    execute: async () =>
      setLocationDefaultSmartLockDeviceCommand(
        parsedLocation.data,
        parsedDevice.data,
      ),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACES);
    },
  });
}
