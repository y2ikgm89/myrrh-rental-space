/**
 * SwitchBotスマートロックの一時パスコード失効（deleteKey）
 *
 * deleteKey は非同期（webhook 主）。API 受理後は REVOKE_PENDING とし、webhook
 * success または Device List から keyId 消失で REVOKED に確定する。
 *
 * @module shared/domain/smart-lock/revoke-passcode
 */

import "server-only";
import { prisma } from "@/shared/db/prisma";
import { getDecryptedSwitchBotCredentialsForRevocation } from "@/shared/domain/settings/api-key-queries";
import { buildPasscodeName } from "@/shared/domain/smart-lock/issue-passcode";
import {
  deletePasscode,
  findKeyByIdInDeviceList,
  findKeyInDeviceList,
} from "@/shared/lib/smart-lock/switchbot-client";
import {
  ReservationStatus,
  SmartLockPasscodeStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { fireAndForget } from "@/shared/lib/async-utils";

export type RevocablePasscode = {
  readonly id: string;
  readonly switchbotKeyId: string | null;
  readonly device: { readonly deviceId: string };
};

export type PendingRecoverablePasscode = RevocablePasscode & {
  readonly reservationId: string;
  readonly deviceId: string;
};

/** Device List で key 消失を確認する疎 poll（秒: 0 / 5 / 15 / 30 / 45）。 */
const REVOKE_CONFIRM_POLL_DELAYS_MS = [
  0, 5_000, 15_000, 30_000, 45_000,
] as const;

const LIVE_PASSCODE_STATUSES = [
  SmartLockPasscodeStatus.PENDING,
  SmartLockPasscodeStatus.CONFIRMED,
  SmartLockPasscodeStatus.REVOKE_PENDING,
] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Device List に `switchbotKeyId` が無ければ REVOKE_PENDING → REVOKED へ claim する。
 */
export async function confirmRevokeByKeyAbsence(
  credentials: { openToken: string; secretKey: string },
  passcode: RevocablePasscode,
): Promise<boolean> {
  if (!passcode.switchbotKeyId) {
    return false;
  }

  const keyResult = await findKeyByIdInDeviceList(
    credentials,
    passcode.device.deviceId,
    passcode.switchbotKeyId,
  );
  if (!keyResult.ok) {
    return false;
  }
  if (keyResult.body !== null) {
    return false;
  }

  const updated = await prisma.smartLockPasscode.updateMany({
    where: {
      id: passcode.id,
      status: SmartLockPasscodeStatus.REVOKE_PENDING,
    },
    data: {
      status: SmartLockPasscodeStatus.REVOKED,
      revokedAt: new Date(),
    },
  });
  return updated.count > 0;
}

export async function pollRevokeConfirmationByKeyAbsence(
  credentials: { openToken: string; secretKey: string },
  passcode: RevocablePasscode,
): Promise<boolean> {
  let elapsedMs = 0;
  for (const targetMs of REVOKE_CONFIRM_POLL_DELAYS_MS) {
    const waitMs = targetMs - elapsedMs;
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    elapsedMs = targetMs;
    if (await confirmRevokeByKeyAbsence(credentials, passcode)) {
      return true;
    }
  }
  return false;
}

/**
 * PENDING 行について Device List の name 突合で live key を見つけ deleteKey する。
 * key が無ければ false（物理 orphan なし）。
 */
export async function recoverPendingPasscodeViaDeviceList(
  credentials: { openToken: string; secretKey: string },
  passcode: PendingRecoverablePasscode,
): Promise<boolean> {
  let keyId = passcode.switchbotKeyId;
  if (!keyId) {
    const name = buildPasscodeName(passcode.reservationId, passcode.deviceId);
    const keyResult = await findKeyInDeviceList(
      credentials,
      passcode.device.deviceId,
      name,
    );
    if (!keyResult.ok || keyResult.body === null) {
      return false;
    }
    keyId = keyResult.body.id;
    await prisma.smartLockPasscode.updateMany({
      where: {
        id: passcode.id,
        status: SmartLockPasscodeStatus.PENDING,
      },
      data: { switchbotKeyId: keyId },
    });
  }

  return revokeOne(credentials, {
    id: passcode.id,
    switchbotKeyId: keyId,
    device: passcode.device,
  });
}

/**
 * 1件のパスコードを deleteKey で失効させる。
 *
 * API 受理後は REVOKE_PENDING（`switchbotDeleteCommandId` / `revokeRequestedAt`）。
 * 即 REVOKED にはしない。Device List 疎 poll で key 消失が確認できれば REVOKED。
 * deleteKey API 失敗時は CONFIRMED / PENDING のまま（cron が再試行可能）。
 */
export async function revokeOne(
  credentials: { openToken: string; secretKey: string },
  passcode: RevocablePasscode,
): Promise<boolean> {
  if (!passcode.switchbotKeyId) {
    logError(new Error("switchbotKeyId未確定のパスコードを失効スキップ"), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "revokeSmartLockPasscode",
        passcodeId: passcode.id,
      },
    });
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

  const now = new Date();
  const commandId = result.body.commandId;

  const updated = await prisma.smartLockPasscode.updateMany({
    where: {
      id: passcode.id,
      status: {
        in: [
          SmartLockPasscodeStatus.CONFIRMED,
          SmartLockPasscodeStatus.PENDING,
        ],
      },
    },
    data: {
      status: SmartLockPasscodeStatus.REVOKE_PENDING,
      revokeRequestedAt: now,
      ...(commandId !== undefined && {
        switchbotDeleteCommandId: commandId,
      }),
    },
  });
  if (updated.count === 0) {
    return false;
  }

  fireAndForget(pollRevokeConfirmationByKeyAbsence(credentials, passcode), {
    operation: "pollRevokeConfirmationByKeyAbsence",
    category: ErrorCategory.EXTERNAL_API,
  });
  return true;
}

async function countLivePasscodesForReservation(
  reservationId: string,
): Promise<number> {
  return prisma.smartLockPasscode.count({
    where: {
      reservationId,
      status: { in: [...LIVE_PASSCODE_STATUSES] },
    },
  });
}

/**
 * 予約に紐づく REVOKE_PENDING を Device List key 消失まで待つ。
 * CONFIRMED / PENDING が残る場合も false。
 */
export async function awaitReservationRevokeConfirmation(
  reservationId: string,
): Promise<boolean> {
  const credentials = await getDecryptedSwitchBotCredentialsForRevocation();
  if (!credentials) {
    return (await countLivePasscodesForReservation(reservationId)) === 0;
  }

  const pendingRecoverable = await prisma.smartLockPasscode.findMany({
    where: { reservationId, status: SmartLockPasscodeStatus.PENDING },
    select: {
      id: true,
      reservationId: true,
      deviceId: true,
      switchbotKeyId: true,
      device: { select: { deviceId: true } },
    },
  });
  await Promise.all(
    pendingRecoverable.map((passcode) =>
      recoverPendingPasscodeViaDeviceList(credentials, passcode),
    ),
  );

  const revokePending = await prisma.smartLockPasscode.findMany({
    where: { reservationId, status: SmartLockPasscodeStatus.REVOKE_PENDING },
    select: {
      id: true,
      switchbotKeyId: true,
      device: { select: { deviceId: true } },
    },
  });

  for (const passcode of revokePending) {
    const confirmed = await pollRevokeConfirmationByKeyAbsence(
      credentials,
      passcode,
    );
    if (!confirmed) {
      return false;
    }
  }

  return (await countLivePasscodesForReservation(reservationId)) === 0;
}

/**
 * デバイスに紐づく REVOKE_PENDING を key 消失まで待つ。未解決なら false。
 */
export async function awaitDeviceRevokeConfirmation(
  deviceRowId: string,
): Promise<boolean> {
  const credentials = await getDecryptedSwitchBotCredentialsForRevocation();
  if (!credentials) {
    return (
      (await prisma.smartLockPasscode.count({
        where: {
          deviceId: deviceRowId,
          status: { in: [...LIVE_PASSCODE_STATUSES] },
        },
      })) === 0
    );
  }

  const pendingRecoverable = await prisma.smartLockPasscode.findMany({
    where: { deviceId: deviceRowId, status: SmartLockPasscodeStatus.PENDING },
    select: {
      id: true,
      reservationId: true,
      deviceId: true,
      switchbotKeyId: true,
      device: { select: { deviceId: true } },
    },
  });
  await Promise.all(
    pendingRecoverable.map((passcode) =>
      recoverPendingPasscodeViaDeviceList(credentials, passcode),
    ),
  );

  const revokePending = await prisma.smartLockPasscode.findMany({
    where: {
      deviceId: deviceRowId,
      status: SmartLockPasscodeStatus.REVOKE_PENDING,
    },
    select: {
      id: true,
      switchbotKeyId: true,
      device: { select: { deviceId: true } },
    },
  });

  for (const passcode of revokePending) {
    const confirmed = await pollRevokeConfirmationByKeyAbsence(
      credentials,
      passcode,
    );
    if (!confirmed) {
      return false;
    }
  }

  return (
    (await prisma.smartLockPasscode.count({
      where: {
        deviceId: deviceRowId,
        status: { in: [...LIVE_PASSCODE_STATUSES] },
      },
    })) === 0
  );
}

/**
 * 指定予約に紐づく発行済み（CONFIRMED）および PENDING orphan を失効させる。
 */
export async function revokeSmartLockPasscodesForReservation(
  reservationId: string,
): Promise<void> {
  const passcodes = await prisma.smartLockPasscode.findMany({
    where: {
      reservationId,
      status: {
        in: [
          SmartLockPasscodeStatus.CONFIRMED,
          SmartLockPasscodeStatus.PENDING,
        ],
      },
    },
    select: {
      id: true,
      reservationId: true,
      deviceId: true,
      switchbotKeyId: true,
      status: true,
      device: { select: { deviceId: true } },
    },
  });
  if (passcodes.length === 0) return;

  const credentials = await getDecryptedSwitchBotCredentialsForRevocation();
  if (!credentials) {
    logError(
      new Error(
        "SwitchBot資格情報が復号できないためパスコード失効をスキップしました",
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
    passcodes.map((passcode) => {
      if (passcode.status === SmartLockPasscodeStatus.PENDING) {
        return recoverPendingPasscodeViaDeviceList(credentials, passcode);
      }
      return revokeOne(credentials, passcode);
    }),
  );
}

/**
 * 失効対象（`endTime` 経過済み、または紐づく予約が CANCELLED）の CONFIRMED パスコードを
 * 一括取得する。REVOKE_PENDING は除外（失効処理中）。
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
 * SwitchBot 連携 OFF 時の stuck 警告用。CONFIRMED（失効待ち条件）と
 * REVOKE_PENDING（失効確定待ち）を数える。
 */
export async function findStuckSmartLockPasscodesWhenIntegrationDisabled(
  now: Date,
): Promise<Array<{ readonly id: string }>> {
  return prisma.smartLockPasscode.findMany({
    where: {
      OR: [
        { status: SmartLockPasscodeStatus.REVOKE_PENDING },
        {
          status: SmartLockPasscodeStatus.CONFIRMED,
          OR: [
            { endTime: { lt: now } },
            { reservation: { status: ReservationStatus.CANCELLED } },
          ],
        },
      ],
    },
    select: { id: true },
  });
}

/**
 * cleanup cron から呼ぶ一括失効処理。成功/失敗件数を返す。
 */
export async function revokeExpiredSmartLockPasscodes(
  now: Date,
): Promise<{ revoked: number; failed: number }> {
  const candidates = await findRevocableSmartLockPasscodes(now);
  if (candidates.length === 0) return { revoked: 0, failed: 0 };

  const credentials = await getDecryptedSwitchBotCredentialsForRevocation();
  if (!credentials) {
    return { revoked: 0, failed: candidates.length };
  }

  const results = await Promise.all(
    candidates.map((passcode) => revokeOne(credentials, passcode)),
  );
  const revoked = results.filter(Boolean).length;
  return { revoked, failed: results.length - revoked };
}

export const STALE_PENDING_THRESHOLD_MINUTES = 30;

export async function expireStalePendingSmartLockPasscodes(
  now: Date,
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - STALE_PENDING_THRESHOLD_MINUTES * 60 * 1000,
  );
  const stale = await prisma.smartLockPasscode.findMany({
    where: {
      status: SmartLockPasscodeStatus.PENDING,
      createdAt: { lt: cutoff },
    },
    select: {
      id: true,
      reservationId: true,
      deviceId: true,
      switchbotKeyId: true,
      endTime: true,
      device: { select: { deviceId: true } },
      reservation: { select: { status: true } },
    },
  });
  if (stale.length === 0) return 0;

  const credentials = await getDecryptedSwitchBotCredentialsForRevocation();
  let failedCount = 0;
  const failedReservationIds = new Set<string>();

  for (const passcode of stale) {
    if (credentials) {
      const name = buildPasscodeName(passcode.reservationId, passcode.deviceId);
      const keyResult = await findKeyInDeviceList(
        credentials,
        passcode.device.deviceId,
        name,
      );
      if (keyResult.ok && keyResult.body !== null) {
        const shouldRevoke =
          passcode.reservation.status === ReservationStatus.CANCELLED ||
          passcode.endTime.getTime() < now.getTime();
        if (shouldRevoke) {
          await recoverPendingPasscodeViaDeviceList(credentials, passcode);
          continue;
        }
        if (passcode.reservation.status === ReservationStatus.CONFIRMED) {
          await prisma.smartLockPasscode.updateMany({
            where: {
              id: passcode.id,
              status: SmartLockPasscodeStatus.PENDING,
            },
            data: {
              status: SmartLockPasscodeStatus.CONFIRMED,
              switchbotKeyId: keyResult.body.id,
              confirmedAt: new Date(),
            },
          });
        }
        continue;
      }
    }

    const updated = await prisma.smartLockPasscode.updateMany({
      where: {
        id: passcode.id,
        status: SmartLockPasscodeStatus.PENDING,
      },
      data: {
        status: SmartLockPasscodeStatus.FAILED,
        failureReason: `Webhook から createKey 完了通知が ${STALE_PENDING_THRESHOLD_MINUTES} 分以内に届かなかったため失敗確定`,
      },
    });
    if (updated.count > 0) {
      failedCount += 1;
      failedReservationIds.add(passcode.reservationId);
    }
  }

  for (const reservationId of failedReservationIds) {
    fireAndForget(
      createNotificationCommand({
        type: NOTIFICATION_TYPE.SMART_LOCK_PASSCODE_FAILED,
        title:
          NOTIFICATION_TYPE_LABELS[
            NOTIFICATION_TYPE.SMART_LOCK_PASSCODE_FAILED
          ],
        message: `予約 ${reservationId} のスマートロックパスコードが ${STALE_PENDING_THRESHOLD_MINUTES} 分以上 PENDING のため失敗確定にしました (webhook 未到着)`,
        resourceType: "reservation",
        resourceId: reservationId,
      }),
      {
        operation: "notifySmartLockPasscodeStalePendingFailed",
        category: ErrorCategory.DATABASE,
      },
    );
  }
  return failedCount;
}

/**
 * REVOKE_PENDING が stale な行を CONFIRMED に戻し、deleteKey を再試行可能にする。
 */
export async function expireStaleRevokePendingSmartLockPasscodes(
  now: Date,
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - STALE_PENDING_THRESHOLD_MINUTES * 60 * 1000,
  );
  const stale = await prisma.smartLockPasscode.findMany({
    where: {
      status: SmartLockPasscodeStatus.REVOKE_PENDING,
      revokeRequestedAt: { lt: cutoff },
    },
    select: { id: true, reservationId: true },
  });
  if (stale.length === 0) return 0;

  const result = await prisma.smartLockPasscode.updateMany({
    where: {
      status: SmartLockPasscodeStatus.REVOKE_PENDING,
      revokeRequestedAt: { lt: cutoff },
    },
    data: {
      status: SmartLockPasscodeStatus.CONFIRMED,
      switchbotDeleteCommandId: null,
      revokeRequestedAt: null,
    },
  });

  const revertedRows =
    result.count === stale.length
      ? stale
      : await prisma.smartLockPasscode.findMany({
          where: {
            id: { in: stale.map((p) => p.id) },
            status: SmartLockPasscodeStatus.CONFIRMED,
          },
          select: { reservationId: true },
        });

  const reservationIds = Array.from(
    new Set(revertedRows.map((p) => p.reservationId)),
  );
  for (const reservationId of reservationIds) {
    fireAndForget(
      createNotificationCommand({
        type: NOTIFICATION_TYPE.SMART_LOCK_PASSCODE_FAILED,
        title:
          NOTIFICATION_TYPE_LABELS[
            NOTIFICATION_TYPE.SMART_LOCK_PASSCODE_FAILED
          ],
        message: `予約 ${reservationId} のスマートロックパスコード失効が ${STALE_PENDING_THRESHOLD_MINUTES} 分以上 REVOKE_PENDING のため CONFIRMED に戻しました (webhook 未到着・再試行可能)`,
        resourceType: "reservation",
        resourceId: reservationId,
      }),
      {
        operation: "notifySmartLockPasscodeStaleRevokePendingReverted",
        category: ErrorCategory.DATABASE,
      },
    );
  }
  return result.count;
}
