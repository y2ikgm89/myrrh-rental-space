import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  ReservationStatus,
  SmartLockPasscodeStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  issueSmartLockPasscodes,
  type IssuedSmartLockPasscode,
} from "@/shared/domain/smart-lock/issue-passcode";
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
 * 2 つの spaceId が同一 SmartLockDevice を共有しているかを判定する
 * (Codex P2 対応 — comment_id=3566998628)。
 *
 * Space.smartLockDeviceId 経由で 1 デバイスが複数スペースに共有される運用
 * (受付ロビー、共用玄関 etc.) が既定モデルなので、spaceId 変更だけで
 * 「別デバイス」と判断すると誤ってクリーンアップを skip し、
 * issueSmartLockPasscodes が @@unique(reservationId, deviceId) の既存 REVOKED
 * 行に阻まれて新 code を発行できなくなる。
 *
 * @returns 両スペースが同一デバイスを参照している場合 true。両方とも null
 *   (デバイス無し) の場合は「クリーンアップ対象なし」の意味で true を返す
 *   (実際には issueSmartLockPasscodes 側が no-op で終わる)。
 */
async function isSameSmartLockDevice(
  spaceIdA: string,
  spaceIdB: string,
): Promise<boolean> {
  if (spaceIdA === spaceIdB) return true;
  const [a, b] = await Promise.all([
    prisma.space.findUnique({
      where: { id: spaceIdA },
      select: { smartLockDeviceId: true },
    }),
    prisma.space.findUnique({
      where: { id: spaceIdB },
      select: { smartLockDeviceId: true },
    }),
  ]);
  return (a?.smartLockDeviceId ?? null) === (b?.smartLockDeviceId ?? null);
}

/**
 * 予約変更成功後の副作用 SSoT (Priority-10 audit #7)。
 *
 * spaceId または startTime/endTime が変更された場合に:
 * - 既発行 CONFIRMED パスコードを SwitchBot deleteKey で失効
 * - 新しい spaceId で issueSmartLockPasscodes を再実行
 * - 発行された新パスコードを呼出側へ返却 (顧客への変更通知メールに含めるため
 *   — Codex P1 対応 comment_id=3566998624)
 *
 * cancellation-side-effects と同じく **tx 外**から呼ぶ。呼出側はこの Promise を
 * await して結果 (新パスコード) をメール送信に渡す契約。
 * 予約 update 本体が失敗すればこの副作用は走らない契約。
 *
 * status が CONFIRMED でない (PENDING/CANCELLED 等)、または startTime が過去の
 * 予約は再発行対象外 (無意味) — 空配列を返す。
 */
export async function applyReservationEditSideEffects(input: {
  reservationId: string;
  oldSpaceId: string;
  oldStartTime: Date;
  oldEndTime: Date;
  newSpaceId: string;
  newStartTime: Date;
  newEndTime: Date;
}): Promise<IssuedSmartLockPasscode[]> {
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
    return [];
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
      return [];
    }

    // 2. 既発行の CONFIRMED パスコードを SwitchBot deleteKey で失効
    //    失効に失敗しても cleanup cron が retry するので issue は続行する。
    await revokeSmartLockPasscodesForReservation(reservationId);

    // 3. @@unique([reservationId, deviceId]) 制約対策 (Codex P2 対応):
    //    device id が変わらないなら REVOKED/FAILED 行を DELETE して issue 側の
    //    一意制約を通過させる。spaceId が違っても同一デバイスを共有する運用
    //    (Space.smartLockDeviceId が同じ) は多いため、spaceId ではなく
    //    実 device id で判定する必要がある。
    const deviceSame = await isSameSmartLockDevice(oldSpaceId, newSpaceId);
    if (deviceSame) {
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

    // 4. 新 spaceId で再発行し、返却された passcode を caller (action) に渡す
    //    (update email に含めて顧客へ配布する契約 — Codex P1 対応)
    return await issueSmartLockPasscodes({
      reservationId,
      spaceId: newSpaceId,
      startTime: newStartTime,
      endTime: newEndTime,
    });
  } catch (error) {
    // 副作用の失敗は予約変更本体を巻き戻さない。
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
    return [];
  }
}
