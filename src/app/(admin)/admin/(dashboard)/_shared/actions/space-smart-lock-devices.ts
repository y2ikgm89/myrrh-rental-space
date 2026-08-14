"use server";

import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import type { MutationResult } from "@/shared/lib/mutation-result";
// CACHE-INVALIDATE-04: SPACES は CDN `space-v1` に emit されるため helper 経由で
// Cloudflare CDN purge も併発する。
import { invalidateSiteWideCache } from "@/shared/lib/cache/site-wide";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { setSpaceSmartLockDeviceCommand } from "@/shared/domain/smart-lock/commands";
import {
  issuePasscodesAfterSpaceBound,
  revokePasscodesAfterSpaceUnbound,
} from "@/shared/domain/smart-lock/assignment-side-effects";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const spaceIdSchema = uuidIdSchema("スペース");
const deviceIdSchema = uuidIdSchema("スマートロックデバイス").nullable();

/**
 * スペースに割り当てるスマートロックデバイスを設定する（`deviceId` に `null` を渡すと解除）。
 *
 * 同一 Location 配下の登録簿から最大 1 台を選ぶだけのシンプルな参照更新のため、
 * conform の FormData 経由ではなく直接引数で呼び出す（削除/トグルアクションと同じパターン）。
 *
 * 割当が変わったら、**まず旧デバイスのパスコードを失効してから**新デバイス分を
 * best-effort issue する。`deviceId === null` かどうかで分岐すると、Pad A → Pad B の
 * 直接付け替え（UI は 1 回の保存でこれができる）で旧 Pad のコードが生き残り、
 * 予約者が「予約していない旧ドアを開けられる／実際のドアを開けられない」状態になる
 * （監査 F-25）。
 */
export async function setSpaceSmartLockDevice(
  spaceId: string,
  deviceId: string | null,
): Promise<MutationResult<{ id: string; smartLockDeviceId: string | null }>> {
  const parsedSpace = spaceIdSchema.safeParse(spaceId);
  const parsedDevice = deviceIdSchema.safeParse(deviceId);
  if (!parsedSpace.success || !parsedDevice.success) {
    return { error: "IDが不正です" };
  }

  return executeAdminMutationResult({
    resource: "space",
    action: "update",
    resourceId: parsedSpace.data,
    execute: async () => {
      const { previousSmartLockDeviceId, ...result } =
        await setSpaceSmartLockDeviceCommand(
          parsedSpace.data,
          parsedDevice.data,
        );

      const assignmentChanged = previousSmartLockDeviceId !== parsedDevice.data;

      // 旧デバイスがあったなら、付け替えでも解除でも先に失効する。
      if (assignmentChanged && previousSmartLockDeviceId !== null) {
        await revokePasscodesAfterSpaceUnbound(parsedSpace.data);
      }
      if (assignmentChanged && parsedDevice.data !== null) {
        issuePasscodesAfterSpaceBound(parsedSpace.data);
      }
      return result;
    },
    afterSuccess: () => {
      invalidateSiteWideCache(CACHE_TAGS.SPACES);
    },
  });
}
