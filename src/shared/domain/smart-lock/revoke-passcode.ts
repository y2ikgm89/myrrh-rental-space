/**
 * SwitchBotスマートロックの一時パスコード失効（deleteKey）
 *
 * @module shared/domain/smart-lock/revoke-passcode
 */

import "server-only";
import { prisma } from "@/shared/db/prisma";
import { getDecryptedSwitchBotCredentials } from "@/shared/domain/settings/api-key-queries";
import { deletePasscode } from "@/shared/lib/smart-lock/switchbot-client";
import {
  ReservationStatus,
  SmartLockPasscodeStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

export type RevocablePasscode = {
  readonly id: string;
  readonly switchbotKeyId: string | null;
  readonly device: { readonly deviceId: string };
};

/**
 * 1件のパスコードをdeleteKeyで失効させる。
 *
 * 成功時のみ`REVOKED`へ更新する。失敗時はCONFIRMEDのまま残し、呼び出し元
 * （cleanup cron）が再試行できるようにする（deleteKey自体は冪等なコマンド呼出の
 * ため、繰り返し呼んでも副作用は増えない）。deviceCommands.ts の
 * deleteSmartLockDeviceCommand からも、削除前の生きたパスコード失効に再利用する。
 */
export async function revokeOne(
  credentials: { openToken: string; secretKey: string },
  passcode: RevocablePasscode,
): Promise<boolean> {
  if (!passcode.switchbotKeyId) {
    // keyId未確定のままCONFIRMEDになることは無いはずだが、念のためガード。
    // 削除しようがないのでスキップ（管理者が事後確認できるようログのみ残す）。
    logError(
      new Error("CONFIRMEDなのにswitchbotKeyId未確定のパスコードをスキップ"),
      {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "revokeSmartLockPasscode",
          passcodeId: passcode.id,
        },
      },
    );
    return false;
  }

  const result = await deletePasscode(
    credentials,
    passcode.device.deviceId,
    passcode.switchbotKeyId,
  );

  if (!result.ok) {
    logError(new Error("SwitchBot deleteKey failed"), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "revokeSmartLockPasscode",
        passcodeId: passcode.id,
        message: result.message,
      },
    });
    return false;
  }

  // deleteKey は既に成功しているため、この後の書込自体は失敗しても物理的な失効は
  // 完了済み。ただし cancellation 経由と cron が同一行を同時に処理し得るため、
  // status=CONFIRMED を WHERE に含めて 2 回目以降の書込を無害な no-op にする
  // (REVOKED 上書き自体は無害だが、updatedAt 等の余計な変更を避ける)。
  await prisma.smartLockPasscode.updateMany({
    where: { id: passcode.id, status: SmartLockPasscodeStatus.CONFIRMED },
    data: {
      status: SmartLockPasscodeStatus.REVOKED,
      revokedAt: new Date(),
    },
  });
  return true;
}

/**
 * 指定予約に紐づく発行済み（CONFIRMED）パスコードを全て失効させる。
 * 予約キャンセル時に即座に呼ぶ（失敗分はcleanup cronがフォールバック回収する）。
 */
export async function revokeSmartLockPasscodesForReservation(
  reservationId: string,
): Promise<void> {
  const passcodes = await prisma.smartLockPasscode.findMany({
    where: { reservationId, status: SmartLockPasscodeStatus.CONFIRMED },
    select: {
      id: true,
      switchbotKeyId: true,
      device: { select: { deviceId: true } },
    },
  });
  if (passcodes.length === 0) return;

  const credentials = await getDecryptedSwitchBotCredentials();
  if (!credentials) {
    logError(
      new Error(
        "SwitchBot連携が無効/未設定のためパスコード失効をスキップしました（cleanup cronの対象外）",
      ),
      {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "revokeSmartLockPasscodesForReservation",
          reservationId,
        },
      },
    );
    return;
  }

  await Promise.all(
    passcodes.map((passcode) => revokeOne(credentials, passcode)),
  );
}

/**
 * 失効対象（`endTime`経過済み、または紐づく予約がCANCELLED）のCONFIRMEDパスコードを
 * 一括取得する。cleanup cronから使う。
 */
export async function findRevocableSmartLockPasscodes(
  now: Date,
): Promise<RevocablePasscode[]> {
  return prisma.smartLockPasscode.findMany({
    where: {
      status: SmartLockPasscodeStatus.CONFIRMED,
      OR: [
        { endTime: { lt: now } },
        { reservation: { status: ReservationStatus.CANCELLED } },
      ],
    },
    select: {
      id: true,
      switchbotKeyId: true,
      device: { select: { deviceId: true } },
    },
  });
}

/**
 * cleanup cronから呼ぶ一括失効処理。成功/失敗件数を返す。
 */
export async function revokeExpiredSmartLockPasscodes(
  now: Date,
): Promise<{ revoked: number; failed: number }> {
  const candidates = await findRevocableSmartLockPasscodes(now);
  if (candidates.length === 0) return { revoked: 0, failed: 0 };

  const credentials = await getDecryptedSwitchBotCredentials();
  if (!credentials) {
    return { revoked: 0, failed: candidates.length };
  }

  const results = await Promise.all(
    candidates.map((passcode) => revokeOne(credentials, passcode)),
  );
  const revoked = results.filter(Boolean).length;
  return { revoked, failed: results.length - revoked };
}
