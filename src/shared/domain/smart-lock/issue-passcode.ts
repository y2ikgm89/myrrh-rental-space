/**
 * 予約確定時のSwitchBotスマートロック用パスコード自動発行
 *
 * @module shared/domain/smart-lock/issue-passcode
 */

import "server-only";
import { randomInt } from "crypto";
import { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { encrypt, safeDecrypt } from "@/shared/lib/crypto";
import { getDecryptedSwitchBotCredentials } from "@/shared/domain/settings/api-key-queries";
import {
  createPasscode,
  getDeviceStatus,
  type SwitchBotCredentials,
} from "@/shared/lib/smart-lock/switchbot-client";
import { SmartLockPasscodeStatus } from "@/shared/lib/validations/enums/prisma-types";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

/** Settingsの暗号化フィールドとは無関係のローカルpurpose（SETTINGS_CRYPTO_PURPOSESには含めない）。 */
export const PASSCODE_CRYPTO_PURPOSE = "switchbot-guest-passcode";

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

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * `createKey`実行時にSwitchBotへ送る`name`を決定論的に組み立てる。
 * Webhook受信側（`switchbotCommandId`からreservationId/deviceIdは分かるがnameは
 * 保持していない）が、同じ入力から同じ`name`を再計算して`keyList`突合に使うために
 * exportする。
 *
 * ハイフンを除去した上で16文字（64bit相当のエントロピー）を採る。8文字
 * （32bit）のままだと、同一デバイスに対する予約が数万件規模に達した場合の
 * 誕生日衝突で別予約のkeyListエントリを誤って突合してしまうリスクがあった。
 */
export function buildPasscodeName(
  reservationId: string,
  deviceRowId: string,
): string {
  const reservationPart = reservationId.replace(/-/g, "").slice(0, 16);
  const devicePart = deviceRowId.replace(/-/g, "").slice(0, 16);
  return `res-${reservationPart}-${devicePart}`;
}

function decryptConfirmedPasscode(
  passcodeCiphertext: string,
  deviceName: string,
  reservationId: string,
): IssuedSmartLockPasscode | null {
  const passcode =
    safeDecrypt(passcodeCiphertext, {
      expectedPurpose: PASSCODE_CRYPTO_PURPOSE,
    })?.toString("utf8") ?? null;
  if (passcode === null) {
    logError(new Error("既存のCONFIRMED済みパスコードの復号に失敗しました"), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: "issueSmartLockPasscodes", reservationId },
    });
    return null;
  }
  return { deviceName, passcode };
}

/**
 * `@@unique([reservationId, deviceId])`の競合（同時issueForDevice呼出）を検知した際、
 * 既に作成済みの行を読み直して結果を解決する。呼び出し元が例外を投げないための
 * リカバリ経路。
 */
async function resolveAfterCreateConflict(
  reservationId: string,
  deviceId: string,
  deviceName: string,
): Promise<IssuedSmartLockPasscode | null> {
  const existing = await prisma.smartLockPasscode.findUnique({
    where: { reservationId_deviceId: { reservationId, deviceId } },
  });
  if (!existing || existing.status !== SmartLockPasscodeStatus.CONFIRMED) {
    return null;
  }
  return decryptConfirmedPasscode(
    existing.passcodeCiphertext,
    deviceName,
    reservationId,
  );
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

  let passcodeRow: { id: string };
  try {
    passcodeRow = await prisma.smartLockPasscode.create({
      data: {
        reservationId: input.reservationId,
        deviceId: device.id,
        status: SmartLockPasscodeStatus.PENDING,
        passcodeCiphertext: encrypt(password, {
          purpose: PASSCODE_CRYPTO_PURPOSE,
        }),
        startTime: bufferedStart,
        endTime: bufferedEnd,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      // 同時に別のリクエストが同じ予約+デバイスの組で先にcreateしていた
      // （二重送信・admin操作の同時実行等）。先勝ちの結果をそのまま採用する。
      return resolveAfterCreateConflict(
        input.reservationId,
        device.id,
        device.deviceName,
      );
    }
    throw error;
  }

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
      data: {
        status: SmartLockPasscodeStatus.FAILED,
        failureReason: createResult.message,
      },
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
      // webhook 側の高速パスが同じ行を先に確定/失効させている可能性があるため、
      // status=PENDING を WHERE に含めた claim 形で書き込む（webhook-commands.ts の
      // processSwitchBotChangeReport と同型）。
      const updated = await prisma.smartLockPasscode.updateMany({
        where: { id: passcodeRow.id, status: SmartLockPasscodeStatus.PENDING },
        data: {
          status: SmartLockPasscodeStatus.CONFIRMED,
          switchbotKeyId: match.id,
          confirmedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        // 同一のcreateKey呼出・同一の物理パスコードに対する別経路（webhook）の
        // 確定と競合した。既にCONFIRMEDならこの呼び出しのpasswordをそのまま
        // 返してよい（webhookが記録したswitchbotKeyIdも同じkeyListエントリを
        // 指すため）。FAILEDに倒れていた場合のみ発行失敗として扱う。
        const current = await prisma.smartLockPasscode.findUnique({
          where: { id: passcodeRow.id },
          select: { status: true },
        });
        if (current?.status === SmartLockPasscodeStatus.CONFIRMED) {
          return { deviceName: device.deviceName, passcode: password };
        }
        return null;
      }
      return { deviceName: device.deviceName, passcode: password };
    }
  }

  await prisma.smartLockPasscode.update({
    where: { id: passcodeRow.id },
    data: {
      status: SmartLockPasscodeStatus.FAILED,
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
 * 予約に紐づくスペースに割り当てられたスマートロックデバイスへ一時パスコードを発行する。
 *
 * - スペースにデバイス未割り当て、またはデバイスが無効化されている場合は no-op で
 *   空配列を返す（戻り値は将来の複数デバイス対応も見据えて配列のまま維持するが、
 *   現在は0または1要素）。
 * - 同一予約・同一デバイスの組は既存レコードがあれば再発行しない（`@@unique`で保証、
 *   このチェックはAPI呼出前の重複防止用）。既にCONFIRMED済みなら復号して結果に含める。
 * - 発行成功・失敗どちらの場合も呼び出し元の処理（確認メール送信）をブロックしないよう
 *   例外は投げない設計。呼び出し元は全てfireAndForget経由でこの関数の完了を待って
 *   から確認メールを送るため、ここで例外が漏れると確認メール自体が送られなくなる
 *   （関数全体をtry/catchで包んで契約を保証する）。
 * - 同一デバイスが複数スペースから参照され得る（物理ロック共有）が、
 *   `@@unique([reservationId, deviceId])`のため予約単位では重複発行されない。
 */
export async function issueSmartLockPasscodes(
  input: IssueSmartLockPasscodesInput,
): Promise<IssuedSmartLockPasscode[]> {
  try {
    const space = await prisma.space.findUnique({
      where: { id: input.spaceId },
      select: { smartLockDevice: true },
    });
    const device = space?.smartLockDevice;
    if (!device || !device.isActive) return [];

    const credentials = await getDecryptedSwitchBotCredentials();
    if (!credentials) {
      logError(
        new Error(
          "SmartLockDeviceが割り当てられているがSwitchBot連携が未設定/無効です",
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

    const existing = await prisma.smartLockPasscode.findUnique({
      where: {
        reservationId_deviceId: {
          reservationId: input.reservationId,
          deviceId: device.id,
        },
      },
    });

    if (existing) {
      if (existing.status === SmartLockPasscodeStatus.CONFIRMED) {
        const resolved = decryptConfirmedPasscode(
          existing.passcodeCiphertext,
          device.deviceName,
          input.reservationId,
        );
        return resolved ? [resolved] : [];
      }
      return [];
    }

    const issued = await issueForDevice(
      device,
      input,
      credentials,
      credentials.passcodeBufferMinutes,
    );
    return issued ? [issued] : [];
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "issueSmartLockPasscodes",
        reservationId: input.reservationId,
        spaceId: input.spaceId,
      },
    });
    return [];
  }
}
