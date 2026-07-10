/**
 * SwitchBot Webhookで受信した`createKey`結果の反映
 *
 * ポーリング（`issue-passcode.ts`）が主経路の確定手段であり、本モジュールは
 * webhookが到達した場合にそれを早期反映する高速パスとして位置づける。
 * SwitchBotはinbound webhookの署名検証機構を公式に提供していないため、
 * 呼び出し元（Route Handler）でURLパストークン + `deviceMac`照合の防御を行った
 * 上で本関数を呼ぶ前提。
 *
 * @module shared/domain/smart-lock/webhook-commands
 */

import "server-only";
import { prisma } from "@/shared/db/prisma";
import { getDecryptedSwitchBotCredentials } from "@/shared/domain/settings/api-key-queries";
import { getDeviceStatus } from "@/shared/lib/smart-lock/switchbot-client";
import { buildPasscodeName } from "./issue-passcode";

export type SwitchBotWebhookCommandResult = "success" | "failed" | "timeout";

export type SwitchBotChangeReportPayload = {
  readonly deviceMac: string;
  readonly eventName: string;
  readonly commandId: string;
  readonly result: SwitchBotWebhookCommandResult;
};

/**
 * `deviceMac`が自テナント登録済みのSmartLockDeviceかどうかを確認する。
 * Route Handler側の二重防御（署名検証機構が無いため）に使う。
 */
export async function isKnownSmartLockDevice(
  deviceMac: string,
): Promise<boolean> {
  const device = await prisma.smartLockDevice.findUnique({
    where: { deviceId: deviceMac },
    select: { id: true },
  });
  return device !== null;
}

/**
 * webhookで受信した`createKey`のchangeReportイベントを処理する。
 *
 * 戻り値は「状態を実際に更新したか」。該当PENDINGレコードが無い（既にポーリングで
 * 確定済み・無関係のcommandId等）場合はfalseを返すが、これはエラーではない
 * （webhookは複数回・遅延して届き得るため、後続イベントが実質no-opになるのは正常）。
 */
export async function processSwitchBotChangeReport(
  payload: SwitchBotChangeReportPayload,
): Promise<boolean> {
  if (payload.eventName !== "createKey") return false;

  const device = await prisma.smartLockDevice.findUnique({
    where: { deviceId: payload.deviceMac },
  });
  if (!device) return false;

  if (payload.result === "failed" || payload.result === "timeout") {
    const updated = await prisma.smartLockPasscode.updateMany({
      where: {
        switchbotCommandId: payload.commandId,
        deviceId: device.id,
        status: "PENDING",
      },
      data: {
        status: "FAILED",
        failureReason: `SwitchBot webhook: ${payload.result}`,
      },
    });
    return updated.count > 0;
  }

  // result === "success" — keyList突合でkeyIdを確定させる必要があるため追加でAPI呼出する。
  const passcodeRow = await prisma.smartLockPasscode.findFirst({
    where: {
      switchbotCommandId: payload.commandId,
      deviceId: device.id,
      status: "PENDING",
    },
  });
  if (!passcodeRow) return false;

  const credentials = await getDecryptedSwitchBotCredentials();
  if (!credentials) return false;

  const name = buildPasscodeName(passcodeRow.reservationId, device.id);
  const statusResult = await getDeviceStatus(credentials, device.deviceId);
  if (!statusResult.ok) return false;

  const match = statusResult.body.keyList?.find((key) => key.name === name);
  if (!match) return false;

  // findFirstとの間にポーリング側が先に確定させていてもstatus="PENDING"ガードで
  // 二重更新にはならない（count=0でno-op）。
  const updated = await prisma.smartLockPasscode.updateMany({
    where: { id: passcodeRow.id, status: "PENDING" },
    data: {
      status: "CONFIRMED",
      switchbotKeyId: match.id,
      confirmedAt: new Date(),
    },
  });
  return updated.count > 0;
}
