import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  ReservationStatus,
  SmartLockPasscodeStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  issueSmartLockPasscodes,
  type IssueSmartLockPasscodesResult,
} from "@/shared/domain/smart-lock/issue-passcode";
import {
  awaitReservationRevokeConfirmation,
  revokeSmartLockPasscodesForReservation,
} from "@/shared/domain/smart-lock/revoke-passcode";
import {
  clearSmartLockReissuePending,
  markSmartLockReissuePending,
} from "@/shared/domain/smart-lock/reissue-passcode";
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
  return getReservationSnapshotForEditById(reservationId, {
    customerId,
  });
}

/** status token 経路: ownership は token 検証側が担保するため customerId フィルタなし。 */
export async function getReservationSnapshotForGuestEdit(
  reservationId: string,
): Promise<{
  readonly spaceId: string;
  readonly startTime: Date;
  readonly endTime: Date;
} | null> {
  return getReservationSnapshotForEditById(reservationId);
}

async function getReservationSnapshotForEditById(
  reservationId: string,
  ownership?: { customerId: string },
): Promise<{
  readonly spaceId: string;
  readonly startTime: Date;
  readonly endTime: Date;
} | null> {
  const reservation = await prisma.reservation.findFirst({
    where: {
      id: reservationId,
      deletedAt: null,
      ...(ownership ? { customerId: ownership.customerId } : {}),
    },
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
 * 予約は再発行対象外 (無意味) — 空配列 + issuanceFailed=false を返す。
 *
 * issuanceFailed の意味 (PR#12 の confirmation email と同じ SSoT):
 * - true: 対象デバイスがある予定だったのに発行に失敗した (fallback 案内が必要)
 * - false: 発行成功 or そもそも対象デバイスなし or 変更対象外
 */
export async function applyReservationEditSideEffects(input: {
  reservationId: string;
  oldSpaceId: string;
  oldStartTime: Date;
  oldEndTime: Date;
  newSpaceId: string;
  newStartTime: Date;
  newEndTime: Date;
}): Promise<IssueSmartLockPasscodesResult> {
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
    return { passcodes: [], issuanceFailed: false };
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
      return { passcodes: [], issuanceFailed: false };
    }

    // 2. 既発行の CONFIRMED / PENDING パスコードを SwitchBot deleteKey で失効
    await revokeSmartLockPasscodesForReservation(reservationId);

    // 3. @@unique([reservationId, deviceId]) 制約対策 (Codex P2 対応):
    //    revoke 直後は CONFIRMED → REVOKE_PENDING。同一 physical device への再発行では
    //    key 消失を待ってから terminal 行を DELETE し createKey する。
    //    失効未確認の REVOKE_PENDING を DELETE すると orphan になるため禁止。
    const deviceSame = await isSameSmartLockDevice(oldSpaceId, newSpaceId);
    if (deviceSame) {
      const revokeConfirmed =
        await awaitReservationRevokeConfirmation(reservationId);
      if (!revokeConfirmed) {
        await markSmartLockReissuePending(reservationId);
        return { passcodes: [], issuanceFailed: true };
      }

      await clearSmartLockReissuePending(reservationId);

      await prisma.smartLockPasscode.deleteMany({
        where: {
          reservationId,
          status: {
            in: [
              SmartLockPasscodeStatus.REVOKED,
              SmartLockPasscodeStatus.FAILED,
              SmartLockPasscodeStatus.PENDING,
            ],
          },
        },
      });
    }

    // 4. 新 spaceId で再発行。IssueSmartLockPasscodesResult をそのまま返し、
    //    呼出側は passcodes を update email に、issuanceFailed=true 時は
    //    fallback 案内文言をメールに載せる (PR#12 confirmation email と同型)。
    return await issueSmartLockPasscodes({
      reservationId,
      spaceId: newSpaceId,
      startTime: newStartTime,
      endTime: newEndTime,
    });
  } catch (error) {
    // 副作用の失敗は予約変更本体を巻き戻さない。
    // cleanup cron / admin の再発行 UI がフォールバック。
    // ここに到達 = 再発行を試みた過程で例外 → 顧客側には fallback 案内を出す。
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
    return { passcodes: [], issuanceFailed: true };
  }
}
