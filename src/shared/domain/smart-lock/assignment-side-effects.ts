/**
 * Pad の無効化・スペース割当変更に伴うパスコード同期副作用。
 *
 * - deactivate / unbind: 将来（endTime 未到来）の CONFIRMED 予約のパスコードを revoke
 * - bind: 同条件でパスコード未発行の CONFIRMED 予約へ best-effort issue
 *
 * @module shared/domain/smart-lock/assignment-side-effects
 */

import "server-only";

import { prisma } from "@/shared/db/prisma";
import { issueSmartLockPasscodes } from "@/shared/domain/smart-lock/issue-passcode";
import { revokeSmartLockPasscodesForReservation } from "@/shared/domain/smart-lock/revoke-passcode";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import {
  ReservationStatus,
  SmartLockPasscodeStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { isSmartLockPadDeviceType } from "@/shared/lib/validations/enums/helpers";

async function findFutureConfirmedReservationIdsForDevice(
  deviceRowId: string,
  now: Date,
): Promise<readonly string[]> {
  const rows = await prisma.reservation.findMany({
    where: {
      status: ReservationStatus.CONFIRMED,
      endTime: { gt: now },
      space: { smartLockDeviceId: deviceRowId },
      smartLockPasscodes: {
        some: {
          deviceId: deviceRowId,
          status: {
            in: [
              SmartLockPasscodeStatus.CONFIRMED,
              SmartLockPasscodeStatus.PENDING,
            ],
          },
        },
      },
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

async function findFutureConfirmedReservationIdsForSpace(
  spaceId: string,
  now: Date,
): Promise<readonly string[]> {
  const rows = await prisma.reservation.findMany({
    where: {
      spaceId,
      status: ReservationStatus.CONFIRMED,
      endTime: { gt: now },
      smartLockPasscodes: {
        some: {
          status: {
            in: [
              SmartLockPasscodeStatus.CONFIRMED,
              SmartLockPasscodeStatus.PENDING,
            ],
          },
        },
      },
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/**
 * Pad デバイス無効化後: そのデバイスに紐づく将来 CONFIRMED 予約のパスコードを失効する。
 */
export async function revokePasscodesAfterPadDeactivated(
  deviceRowId: string,
): Promise<void> {
  const device = await prisma.smartLockDevice.findUnique({
    where: { id: deviceRowId },
    select: { deviceType: true },
  });
  if (!device || !isSmartLockPadDeviceType(device.deviceType)) {
    return;
  }

  const reservationIds = await findFutureConfirmedReservationIdsForDevice(
    deviceRowId,
    new Date(),
  );
  await Promise.all(
    reservationIds.map((reservationId) =>
      revokeSmartLockPasscodesForReservation(reservationId),
    ),
  );
}

/**
 * スペースから Pad を解除した後: 当該スペースの将来 CONFIRMED 予約のパスコードを失効する。
 */
export async function revokePasscodesAfterSpaceUnbound(
  spaceId: string,
): Promise<void> {
  const reservationIds = await findFutureConfirmedReservationIdsForSpace(
    spaceId,
    new Date(),
  );
  await Promise.all(
    reservationIds.map((reservationId) =>
      revokeSmartLockPasscodesForReservation(reservationId),
    ),
  );
}

/**
 * スペースへ Pad を新規割当した後: パスコード未発行の将来 CONFIRMED 予約へ best-effort issue。
 * 失敗時の admin 通知は `issueSmartLockPasscodes` 内の既存パターンに委譲する。
 */
export function issuePasscodesAfterSpaceBound(spaceId: string): void {
  fireAndForget(
    (async () => {
      const now = new Date();
      const reservations = await prisma.reservation.findMany({
        where: {
          spaceId,
          status: ReservationStatus.CONFIRMED,
          endTime: { gt: now },
          // 「行が 1 件も無い」ではなく「**生きた**パスコードが無い」で絞る。
          // revoke は行を消さず status=REVOKED を残すので、`none: {}` だと
          // 一度解除したスペースに Pad を付け直しても、REVOKED 行が残っている予約は
          // 対象から外れ、**顧客が当日ドアを開けられない**（監査 F-67）。
          // 失効側の `findFutureConfirmedReservationIdsForSpace` は status を見ており、
          // 発行側だけが非対称だった。
          smartLockPasscodes: {
            none: {
              status: {
                in: [
                  SmartLockPasscodeStatus.CONFIRMED,
                  SmartLockPasscodeStatus.PENDING,
                ],
              },
            },
          },
        },
        select: {
          id: true,
          spaceId: true,
          startTime: true,
          endTime: true,
        },
      });

      await Promise.all(
        reservations.map((reservation) =>
          issueSmartLockPasscodes({
            reservationId: reservation.id,
            spaceId: reservation.spaceId,
            startTime: reservation.startTime,
            endTime: reservation.endTime,
          }),
        ),
      );
    })(),
    {
      operation: "issuePasscodesAfterSpaceBound",
      category: ErrorCategory.UNKNOWN,
      context: { spaceId },
    },
  );
}
