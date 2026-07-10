/**
 * 予約確定時のSwitchBotスマートロック用パスコード自動発行
 *
 * @module shared/domain/smart-lock/issue-passcode
 */

import "server-only";
import { randomInt } from "crypto";
import { prisma } from "@/shared/db/prisma";
import { decrypt, encrypt } from "@/shared/lib/crypto";
import { getDecryptedSwitchBotCredentials } from "@/shared/domain/settings/api-key-queries";
import {
  createPasscode,
  getDeviceStatus,
  type SwitchBotCredentials,
} from "@/shared/lib/smart-lock/switchbot-client";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

/** Settingsの暗号化フィールドとは無関係のローカルpurpose（SETTINGS_CRYPTO_PURPOSESには含めない）。 */
const PASSCODE_CRYPTO_PURPOSE = "switchbot-guest-passcode";

/** Get Device Statusでのkeyid確定ポーリング間隔・上限（SwitchBotのcommandタイムアウトは1分）。 */
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 15; // 3s * 15 = 45s

export type IssueSmartLockPasscodesInput = {
  readonly reservationId: string;
  readonly spaceId: string;
  readonly startTime: Date;
  readonly endTime: Date;
};

export type IssuedSmartLockPasscode = {
  readonly deviceName: string;
  readonly passcode: string;
};

function generatePasscode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `createKey`実行時にSwitchBotへ送る`name`を決定論的に組み立てる。
 * Webhook受信側（`switchbotCommandId`からreservationId/deviceIdは分かるがnameは
 * 保持していない）が、同じ入力から同じ`name`を再計算して`keyList`突合に使うために
 * exportする。
 */
export function buildPasscodeName(
  reservationId: string,
  deviceRowId: string,
): string {
  return `res-${reservationId.slice(0, 8)}-${deviceRowId.slice(0, 8)}`;
}

async function issueForDevice(
  device: {
    readonly id: string;
    readonly deviceId: string;
    readonly deviceName: string;
  },
  input: IssueSmartLockPasscodesInput,
  credentials: SwitchBotCredentials,
  bufferMinutes: number,
): Promise<IssuedSmartLockPasscode | null> {
  const bufferMs = bufferMinutes * 60_000;
  const bufferedStart = new Date(input.startTime.getTime() - bufferMs);
  const bufferedEnd = new Date(input.endTime.getTime() + bufferMs);
  const password = generatePasscode();
  const name = buildPasscodeName(input.reservationId, device.id);

  const passcodeRow = await prisma.smartLockPasscode.create({
    data: {
      reservationId: input.reservationId,
      deviceId: device.id,
      status: "PENDING",
      passcodeCiphertext: encrypt(password, {
        purpose: PASSCODE_CRYPTO_PURPOSE,
      }),
      startTime: bufferedStart,
      endTime: bufferedEnd,
    },
  });

  const createResult = await createPasscode(credentials, {
    deviceId: device.deviceId,
    name,
    type: "timeLimit",
    password,
    startTime: Math.floor(bufferedStart.getTime() / 1000),
    endTime: Math.floor(bufferedEnd.getTime() / 1000),
  });

  if (!createResult.ok) {
    await prisma.smartLockPasscode.update({
      where: { id: passcodeRow.id },
      data: { status: "FAILED", failureReason: createResult.message },
    });
    logError(new Error("SwitchBot createKey failed"), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "issueSmartLockPasscode",
        reservationId: input.reservationId,
        deviceRowId: device.id,
        message: createResult.message,
      },
    });
    return null;
  }

  await prisma.smartLockPasscode.update({
    where: { id: passcodeRow.id },
    data: { switchbotCommandId: createResult.body.commandId },
  });

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(POLL_INTERVAL_MS);
    }
    const statusResult = await getDeviceStatus(credentials, device.deviceId);
    if (!statusResult.ok) continue;

    const match = statusResult.body.keyList?.find((key) => key.name === name);
    if (match) {
      await prisma.smartLockPasscode.update({
        where: { id: passcodeRow.id },
        data: {
          status: "CONFIRMED",
          switchbotKeyId: match.id,
          confirmedAt: new Date(),
        },
      });
      return { deviceName: device.deviceName, passcode: password };
    }
  }

  await prisma.smartLockPasscode.update({
    where: { id: passcodeRow.id },
    data: {
      status: "FAILED",
      failureReason: "Get Device Statusでのkeyid確定がタイムアウトしました",
    },
  });
  logError(new Error("SwitchBot passcode confirmation timed out"), {
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.HIGH,
    context: {
      operation: "issueSmartLockPasscode",
      reservationId: input.reservationId,
      deviceRowId: device.id,
    },
  });
  return null;
}

/**
 * 予約に紐づくスペースのアクティブなスマートロックデバイスすべてに一時パスコードを発行する。
 *
 * - 対象デバイスが無い（スペースにスマートロック未設定）場合は no-op で空配列を返す。
 * - 同一予約・同一デバイスの組は既存レコードがあれば再発行しない（`@@unique`で保証、
 *   このチェックはAPI呼出前の重複防止用）。既にCONFIRMED済みなら復号して結果に含める。
 * - 発行成功・失敗どちらの場合も呼び出し元の処理（確認メール送信）をブロックしないよう
 *   例外は投げない設計とし、失敗したデバイスは戻り値に含めない（管理者はDBの
 *   FAILEDレコードで事後確認できる）。
 */
export async function issueSmartLockPasscodes(
  input: IssueSmartLockPasscodesInput,
): Promise<IssuedSmartLockPasscode[]> {
  const devices = await prisma.smartLockDevice.findMany({
    where: { spaceId: input.spaceId, isActive: true },
  });
  if (devices.length === 0) return [];

  const credentials = await getDecryptedSwitchBotCredentials();
  if (!credentials) {
    logError(
      new Error(
        "SmartLockDeviceが登録されているがSwitchBot連携が未設定/無効です",
      ),
      {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.HIGH,
        context: {
          operation: "issueSmartLockPasscodes",
          reservationId: input.reservationId,
          spaceId: input.spaceId,
        },
      },
    );
    return [];
  }

  // デバイスごとに独立してポーリング待ち（最大45秒）が発生するため、複数台登録時に
  // 待ち時間が積み上がらないよう並行実行する。
  const perDevice = await Promise.all(
    devices.map(async (device) => {
      const existing = await prisma.smartLockPasscode.findUnique({
        where: {
          reservationId_deviceId: {
            reservationId: input.reservationId,
            deviceId: device.id,
          },
        },
      });

      if (existing) {
        if (existing.status === "CONFIRMED") {
          const passcode = decrypt(existing.passcodeCiphertext);
          return { deviceName: device.deviceName, passcode };
        }
        return null;
      }

      return issueForDevice(
        device,
        input,
        credentials,
        credentials.passcodeBufferMinutes,
      );
    }),
  );

  return perDevice.filter((r): r is IssuedSmartLockPasscode => r !== null);
}
