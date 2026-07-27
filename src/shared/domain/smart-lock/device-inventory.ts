/**
 * SwitchBot Device List との突合（登録・更新時の fail-closed 検証）。
 *
 * @module shared/domain/smart-lock/device-inventory
 */

import "server-only";

import type { SmartLockDeviceType } from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import { getDecryptedSwitchBotCredentials } from "@/shared/domain/settings/api-key-queries";
import {
  findDeviceInDeviceList,
  resolveSwitchBotDeviceFamily,
} from "@/shared/lib/smart-lock/switchbot-client";
import { isSmartLockPadDeviceType } from "@/shared/lib/validations/enums/helpers";

/**
 * SwitchBot 連携が有効なとき、Device List で deviceId の存在と pad/lock 家族一致を検証する。
 * 連携 OFF / 資格情報なしのときはスキップ。有効時は fail closed。
 */
export async function assertDeviceMatchesSwitchBotInventory(
  deviceId: string,
  deviceType: SmartLockDeviceType,
): Promise<void> {
  const credentials = await getDecryptedSwitchBotCredentials();
  if (!credentials) {
    return;
  }

  const listResult = await findDeviceInDeviceList(credentials, deviceId);
  if (!listResult.ok) {
    throw new DomainError(
      listResult.message ||
        "SwitchBot デバイス一覧の取得に失敗したため登録できません",
      "VALIDATION",
    );
  }
  if (!listResult.body) {
    throw new DomainError(
      "指定のデバイスIDは SwitchBot アカウントに存在しません",
      "VALIDATION",
    );
  }

  const family = resolveSwitchBotDeviceFamily(listResult.body.deviceType);
  const expectedFamily = isSmartLockPadDeviceType(deviceType) ? "pad" : "lock";
  if (family !== expectedFamily) {
    throw new DomainError(
      "デバイスIDの機種（Keypad / Lock）が選択した機種と一致しません",
      "VALIDATION",
    );
  }
}
