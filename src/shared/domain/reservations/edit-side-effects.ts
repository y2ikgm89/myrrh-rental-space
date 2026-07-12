import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  ReservationStatus,
  SmartLockPasscodeStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { issueSmartLockPasscodes } from "@/shared/domain/smart-lock/issue-passcode";
import { revokeSmartLockPasscodesForReservation } from "@/shared/domain/smart-lock/revoke-passcode";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

/**
 * 予約変更 side-effect の判定に必要な「変更前スナップショット」を取得する
 * 軽量クエリ (Priority-10 audit #7)。
 *
 * public action layer は Prisma 直 import 禁止のため domain 側で export し、
 * update 呼出の直前に action から呼んでもらう契約。
 */
export async function getReservationSnapshotForEdit(
  reservationId: string,
  customerId: string,
): Promise<{
  readonly spaceId: string;
  readonly startTime: Date;
  readonly endTime: Date;
} | null> {
  const reservation = await prisma.reservation.findFirst({
    where: { id: reservationId, customerId, deletedAt: null },
    select: { spaceId: true, startTime: true, endTime: true },
  });
  return reservation ?? null;
}

/**
 * 予約変更成功後の副作用 SSoT (Priority-10 audit #7)。
 *
 * spaceId または startTime/endTime が変更された場合に:
 * - 既発行 CONFIRMED パスコードを SwitchBot deleteKey で失効
 * - 新しい spaceId で issueSmartLockPasscodes を再実行
 *
 * cancellation-side-effects と同じく **tx 外**から呼ぶ (fireAndForget 想定)。
 * 予約 update 本体が失敗すればこの副作用は走らない契約。
 *
 * status が CONFIRMED でない (PENDING/CANCELLED 等)、または startTime が過去の
 * 予約は再発行対象外 (無意味)。
 */
export async function applyReservationEditSideEffects(input: {
  reservationId: string;
  oldSpaceId: string;
  oldStartTime: Date;
  oldEndTime: Date;
  newSpaceId: string;
  newStartTime: Date;
  newEndTime: Date;
}): Promise<void> {
  const {
    reservationId,
    oldSpaceId,
    oldStartTime,
    oldEndTime,
    newSpaceId,
    newStartTime,
    newEndTime,
  } = input;

  const spaceChanged = oldSpaceId !== newSpaceId;
  const timeChanged =
    oldStartTime.getTime() !== newStartTime.getTime() ||
    oldEndTime.getTime() !== newEndTime.getTime();

  if (!spaceChanged && !timeChanged) {
    return;
  }

  try {
    // 1. 現在 CONFIRMED かつ未来 startTime のときのみ再発行対象
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { status: true, startTime: true },
    });
    if (
      !reservation ||
      reservation.status !== ReservationStatus.CONFIRMED ||
      reservation.startTime.getTime() <= Date.now()
    ) {
      return;
    }

    // 2. 既発行の CONFIRMED パスコードを SwitchBot deleteKey で失効
    //    失効に失敗しても cleanup cron が retry するので issue は続行する。
    await revokeSmartLockPasscodesForReservation(reservationId);

    // 3. @@unique([reservationId, deviceId]) 制約対策: 同一スペース = 同一デバイス
    //    ケースでは REVOKED/FAILED 行を DELETE して issue 側の一意制約を通過させる。
    //    異スペース (異デバイス) の場合は履歴 (REVOKED) を残し、新デバイスへの
    //    unique 制約は自然に空いている状態になる。
    if (!spaceChanged) {
      await prisma.smartLockPasscode.deleteMany({
        where: {
          reservationId,
          status: {
            in: [
              SmartLockPasscodeStatus.REVOKED,
              SmartLockPasscodeStatus.FAILED,
            ],
          },
        },
      });
    }

    // 4. 新 spaceId で再発行
    await issueSmartLockPasscodes({
      reservationId,
      spaceId: newSpaceId,
      startTime: newStartTime,
      endTime: newEndTime,
    });
  } catch (error) {
    // 副作用の失敗は予約変更本体を巻き戻さない (fireAndForget 契約)。
    // cleanup cron / admin の再発行 UI がフォールバック。
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "applyReservationEditSideEffects",
        reservationId,
        spaceChanged,
        timeChanged,
      },
    });
  }
}
