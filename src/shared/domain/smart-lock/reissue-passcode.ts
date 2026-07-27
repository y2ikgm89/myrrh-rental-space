/**
 * 予約変更後の SwitchBot パスコード再発行（revoke 確定待ち → createKey）
 *
 * edit-side-effects は同一リクエスト内で key 消失を poll するが、45s 以内に
 * 確認できなければ `Reservation.smartLockReissuePendingAt` を立てて終了する。
 * deleteKey webhook / smart-lock-cleanup cron が revoke 確定後に createKey する。
 *
 * @module shared/domain/smart-lock/reissue-passcode
 */

import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  issueSmartLockPasscodes,
  type IssueSmartLockPasscodesResult,
} from "@/shared/domain/smart-lock/issue-passcode";
import { awaitReservationRevokeConfirmation } from "@/shared/domain/smart-lock/revoke-passcode";
import {
  ReservationStatus,
  SmartLockPasscodeStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

const TERMINAL_PASSCODE_STATUSES = [
  SmartLockPasscodeStatus.REVOKED,
  SmartLockPasscodeStatus.FAILED,
  SmartLockPasscodeStatus.PENDING,
] as const;

export async function markSmartLockReissuePending(
  reservationId: string,
): Promise<void> {
  await prisma.reservation.updateMany({
    where: {
      id: reservationId,
      status: ReservationStatus.CONFIRMED,
      smartLockReissuePendingAt: null,
    },
    data: { smartLockReissuePendingAt: new Date() },
  });
}

export async function clearSmartLockReissuePending(
  reservationId: string,
): Promise<void> {
  await prisma.reservation.updateMany({
    where: { id: reservationId },
    data: { smartLockReissuePendingAt: null },
  });
}

async function deleteTerminalPasscodeRowsForReservation(
  reservationId: string,
): Promise<void> {
  await prisma.smartLockPasscode.deleteMany({
    where: {
      reservationId,
      status: { in: [...TERMINAL_PASSCODE_STATUSES] },
    },
  });
}

/**
 * revoke 確定後に createKey する。成功時のみ pending フラグをクリアする。
 */
export async function completePendingSmartLockReissue(
  reservationId: string,
): Promise<IssueSmartLockPasscodesResult | null> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      status: true,
      spaceId: true,
      startTime: true,
      endTime: true,
      smartLockReissuePendingAt: true,
    },
  });

  if (!reservation?.smartLockReissuePendingAt) {
    return null;
  }

  if (
    reservation.status !== ReservationStatus.CONFIRMED ||
    reservation.startTime.getTime() <= Date.now()
  ) {
    await clearSmartLockReissuePending(reservationId);
    return null;
  }

  const revokeConfirmed =
    await awaitReservationRevokeConfirmation(reservationId);
  if (!revokeConfirmed) {
    return null;
  }

  await deleteTerminalPasscodeRowsForReservation(reservationId);

  const result = await issueSmartLockPasscodes({
    reservationId: reservation.id,
    spaceId: reservation.spaceId,
    startTime: reservation.startTime,
    endTime: reservation.endTime,
  });

  if (!result.issuanceFailed) {
    await clearSmartLockReissuePending(reservationId);
  }

  return result;
}

/**
 * smart-lock-cleanup cron から呼ぶ。pending 再発行をベストエフォートで完走する。
 */
export async function processPendingSmartLockReissues(
  now: Date,
): Promise<{ attempted: number; completed: number; failed: number }> {
  const pending = await prisma.reservation.findMany({
    where: {
      smartLockReissuePendingAt: { not: null },
      status: ReservationStatus.CONFIRMED,
      startTime: { gt: now },
      deletedAt: null,
    },
    select: { id: true },
    take: 50,
  });

  if (pending.length === 0) {
    return { attempted: 0, completed: 0, failed: 0 };
  }

  let completed = 0;
  let failed = 0;

  for (const row of pending) {
    try {
      const result = await completePendingSmartLockReissue(row.id);
      if (result === null) {
        continue;
      }
      if (result.issuanceFailed) {
        failed += 1;
      } else {
        completed += 1;
      }
    } catch (error) {
      failed += 1;
      logError(normalizeError(error), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
        context: {
          operation: "processPendingSmartLockReissues",
          reservationId: row.id,
        },
      });
    }
  }

  return { attempted: pending.length, completed, failed };
}
