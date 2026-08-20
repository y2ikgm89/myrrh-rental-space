/**
 * SwitchBot Webhook で受信した createKey / deleteKey 結果の反映
 *
 * コマンド成否は webhook を正本とする。keyId 解決は Device List (`keyList`)。
 *
 * @module shared/domain/smart-lock/webhook-commands
 */

import "server-only";
import { prisma } from "@/shared/db/prisma";
import {
  getDecryptedSwitchBotCredentials,
  getDecryptedSwitchBotCredentialsForRevocation,
} from "@/shared/domain/settings/api-key-queries";
import { findKeyInDeviceList } from "@/shared/lib/smart-lock/switchbot-client";
import {
  ReservationStatus,
  SmartLockPasscodeStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { isSmartLockBodyDeviceType } from "@/shared/lib/validations/enums/helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import {
  buildPasscodeName,
  DEVICE_LIST_POLL_OFFSETS_MS,
} from "./issue-passcode";
import { completePendingSmartLockReissue } from "./reissue-passcode";
import { confirmRevokeByKeyAbsence, revokeOne } from "./revoke-passcode";

export type SwitchBotWebhookCommandResult = "success" | "failed" | "timeout";

export type SwitchBotChangeReportPayload = {
  readonly deviceMac: string;
  readonly eventName: string;
  readonly commandId?: string;
  readonly result: SwitchBotWebhookCommandResult;
  readonly keyName?: string;
};

export type SwitchBotLockStateReportPayload = {
  readonly deviceMac: string;
  readonly lockState?: string;
  readonly doorState?: string;
  readonly battery?: number;
  readonly timeOfSample?: number;
};

export async function isKnownSmartLockDevice(
  deviceMac: string,
): Promise<boolean> {
  const device = await prisma.smartLockDevice.findUnique({
    where: { deviceId: deviceMac },
    select: { id: true },
  });
  return device !== null;
}

function normalizeEventName(eventName: string): string {
  return eventName.trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findRevokePendingPasscodeForDeleteWebhook(input: {
  readonly deviceRowId: string;
  readonly commandId?: string;
  readonly keyName?: string;
}): Promise<{
  readonly id: string;
  readonly reservationId: string;
  readonly switchbotKeyId: string | null;
} | null> {
  if (input.commandId) {
    const byCommand = await prisma.smartLockPasscode.findFirst({
      where: {
        deviceId: input.deviceRowId,
        status: SmartLockPasscodeStatus.REVOKE_PENDING,
        switchbotDeleteCommandId: input.commandId,
      },
      select: { id: true, reservationId: true, switchbotKeyId: true },
    });
    if (byCommand) return byCommand;
  }

  if (input.keyName) {
    const candidates = await prisma.smartLockPasscode.findMany({
      where: {
        deviceId: input.deviceRowId,
        status: SmartLockPasscodeStatus.REVOKE_PENDING,
      },
      select: { id: true, reservationId: true, switchbotKeyId: true },
    });
    for (const row of candidates) {
      const expectedName = buildPasscodeName(
        row.reservationId,
        input.deviceRowId,
      );
      if (expectedName === input.keyName) {
        return row;
      }
    }
  }

  const pendingOnDevice = await prisma.smartLockPasscode.findMany({
    where: {
      deviceId: input.deviceRowId,
      status: SmartLockPasscodeStatus.REVOKE_PENDING,
    },
    select: { id: true, reservationId: true, switchbotKeyId: true },
  });
  if (pendingOnDevice.length === 1) {
    return pendingOnDevice[0] ?? null;
  }
  return null;
}

async function processDeleteKeyChangeReport(
  device: { readonly id: string; readonly deviceId: string },
  payload: SwitchBotChangeReportPayload,
): Promise<boolean> {
  const passcodeRow = await findRevokePendingPasscodeForDeleteWebhook({
    deviceRowId: device.id,
    ...(payload.commandId !== undefined
      ? { commandId: payload.commandId }
      : {}),
    ...(payload.keyName !== undefined ? { keyName: payload.keyName } : {}),
  });
  if (!passcodeRow) return false;

  if (payload.result === "failed" || payload.result === "timeout") {
    const updated = await prisma.smartLockPasscode.updateMany({
      where: {
        id: passcodeRow.id,
        status: SmartLockPasscodeStatus.REVOKE_PENDING,
      },
      data: {
        status: SmartLockPasscodeStatus.CONFIRMED,
        switchbotDeleteCommandId: null,
        revokeRequestedAt: null,
        failureReason: `SwitchBot webhook deleteKey: ${payload.result}`,
      },
    });
    return updated.count > 0;
  }

  const updated = await prisma.smartLockPasscode.updateMany({
    where: {
      id: passcodeRow.id,
      status: SmartLockPasscodeStatus.REVOKE_PENDING,
    },
    data: {
      status: SmartLockPasscodeStatus.REVOKED,
      revokedAt: new Date(),
    },
  });
  if (updated.count === 0) {
    return false;
  }

  fireAndForget(completePendingSmartLockReissue(passcodeRow.reservationId), {
    operation: "completePendingSmartLockReissueFromWebhook",
    category: ErrorCategory.EXTERNAL_API,
  });

  return true;
}

async function findPendingPasscodeForCreateWebhook(input: {
  readonly deviceRowId: string;
  readonly commandId?: string;
  readonly keyName?: string;
}): Promise<{
  readonly id: string;
  readonly reservationId: string;
  readonly switchbotKeyId: string | null;
} | null> {
  if (input.commandId) {
    const byCommand = await prisma.smartLockPasscode.findFirst({
      where: {
        deviceId: input.deviceRowId,
        status: SmartLockPasscodeStatus.PENDING,
        switchbotCommandId: input.commandId,
      },
      select: { id: true, reservationId: true, switchbotKeyId: true },
    });
    if (byCommand) return byCommand;
  }

  if (input.keyName) {
    const candidates = await prisma.smartLockPasscode.findMany({
      where: {
        deviceId: input.deviceRowId,
        status: SmartLockPasscodeStatus.PENDING,
      },
      select: { id: true, reservationId: true, switchbotKeyId: true },
    });
    for (const row of candidates) {
      const expectedName = buildPasscodeName(
        row.reservationId,
        input.deviceRowId,
      );
      if (expectedName === input.keyName) {
        return row;
      }
    }
  }

  const pendingOnDevice = await prisma.smartLockPasscode.findMany({
    where: {
      deviceId: input.deviceRowId,
      status: SmartLockPasscodeStatus.PENDING,
    },
    select: { id: true, reservationId: true, switchbotKeyId: true },
  });
  if (pendingOnDevice.length === 1) {
    return pendingOnDevice[0] ?? null;
  }
  return null;
}

async function processCreateKeyChangeReport(
  device: { readonly id: string; readonly deviceId: string },
  payload: SwitchBotChangeReportPayload,
): Promise<boolean> {
  const passcodeRow = await findPendingPasscodeForCreateWebhook({
    deviceRowId: device.id,
    ...(payload.commandId !== undefined
      ? { commandId: payload.commandId }
      : {}),
    ...(payload.keyName !== undefined ? { keyName: payload.keyName } : {}),
  });
  if (!passcodeRow) return false;

  if (payload.result === "failed" || payload.result === "timeout") {
    const updated = await prisma.smartLockPasscode.updateMany({
      where: {
        id: passcodeRow.id,
        status: SmartLockPasscodeStatus.PENDING,
      },
      data: {
        status: SmartLockPasscodeStatus.FAILED,
        failureReason: `SwitchBot webhook: ${payload.result}`,
      },
    });
    return updated.count > 0;
  }

  if (await confirmCreateKeyFromDeviceList(device, passcodeRow)) {
    return true;
  }

  // keyList 反映は webhook success より遅れる（実機 120s+）。200 ack は維持し、
  // 短周期で再試行する。見つからなければ PENDING のまま次の物質化に任せる。
  fireAndForget(pollConfirmCreateKeyFromDeviceList(device, passcodeRow), {
    operation: "pollConfirmCreateKeyFromDeviceList",
    category: ErrorCategory.EXTERNAL_API,
  });
  return false;
}

async function confirmCreateKeyFromDeviceList(
  device: { readonly id: string; readonly deviceId: string },
  passcodeRow: { readonly id: string; readonly reservationId: string },
): Promise<boolean> {
  const credentials = await getDecryptedSwitchBotCredentials();
  if (!credentials) return false;

  const name = buildPasscodeName(passcodeRow.reservationId, device.id);
  const keyResult = await findKeyInDeviceList(
    credentials,
    device.deviceId,
    name,
  );
  if (!keyResult.ok) return false;

  const match = keyResult.body;
  if (!match) return false;

  const updated = await prisma.smartLockPasscode.updateMany({
    where: { id: passcodeRow.id, status: SmartLockPasscodeStatus.PENDING },
    data: {
      status: SmartLockPasscodeStatus.CONFIRMED,
      switchbotKeyId: match.id,
      confirmedAt: new Date(),
    },
  });
  if (updated.count === 0) {
    return false;
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id: passcodeRow.reservationId },
    select: { status: true },
  });
  if (!reservation || reservation.status !== ReservationStatus.CONFIRMED) {
    const revokeCredentials =
      await getDecryptedSwitchBotCredentialsForRevocation();
    if (revokeCredentials) {
      await revokeOne(revokeCredentials, {
        id: passcodeRow.id,
        switchbotKeyId: match.id,
        device: { deviceId: device.deviceId },
      });
    }
  }

  return true;
}

async function pollConfirmCreateKeyFromDeviceList(
  device: { readonly id: string; readonly deviceId: string },
  passcodeRow: { readonly id: string; readonly reservationId: string },
): Promise<boolean> {
  for (
    let attempt = 1;
    attempt < DEVICE_LIST_POLL_OFFSETS_MS.length;
    attempt++
  ) {
    const currentOffset = DEVICE_LIST_POLL_OFFSETS_MS[attempt] ?? 0;
    const previousOffset = DEVICE_LIST_POLL_OFFSETS_MS[attempt - 1] ?? 0;
    await sleep(currentOffset - previousOffset);
    if (await confirmCreateKeyFromDeviceList(device, passcodeRow)) {
      return true;
    }
  }
  return false;
}

/**
 * webhook で受信した changeReport（createKey / deleteKey）を処理する。
 */
export async function processSwitchBotChangeReport(
  payload: SwitchBotChangeReportPayload,
): Promise<boolean> {
  const eventName = normalizeEventName(payload.eventName);
  if (eventName !== "createKey" && eventName !== "deleteKey") {
    return false;
  }

  const device = await prisma.smartLockDevice.findUnique({
    where: { deviceId: payload.deviceMac },
  });
  if (!device) return false;

  if (eventName === "deleteKey") {
    return processDeleteKeyChangeReport(device, payload);
  }
  return processCreateKeyChangeReport(device, payload);
}

/**
 * 錠デバイス（LOCK / LOCK_LITE / LOCK_PRO）の lockState webhook を反映する。
 */
export async function processSwitchBotLockStateReport(
  payload: SwitchBotLockStateReportPayload,
): Promise<boolean> {
  const device = await prisma.smartLockDevice.findUnique({
    where: { deviceId: payload.deviceMac },
    select: { id: true, deviceType: true, lastStateAt: true },
  });
  if (!device) return false;

  if (!isSmartLockBodyDeviceType(device.deviceType)) {
    return false;
  }

  const lastStateAt =
    payload.timeOfSample !== undefined
      ? new Date(payload.timeOfSample * 1000)
      : new Date();

  // 古い timeOfSample は捨てる（webhook 再送・順序逆転の単調性）。
  if (
    payload.timeOfSample !== undefined &&
    device.lastStateAt !== null &&
    lastStateAt.getTime() < device.lastStateAt.getTime()
  ) {
    return false;
  }

  const updated = await prisma.smartLockDevice.updateMany({
    where: {
      deviceId: payload.deviceMac,
      OR: [{ lastStateAt: null }, { lastStateAt: { lte: lastStateAt } }],
    },
    data: {
      ...(payload.lockState !== undefined && {
        lastLockState: payload.lockState,
      }),
      ...(payload.doorState !== undefined && {
        lastDoorState: payload.doorState,
      }),
      ...(payload.battery !== undefined && { lastBattery: payload.battery }),
      lastStateAt,
    },
  });
  return updated.count > 0;
}

/**
 * deleteKey webhook success 後、Device List で key 消失を確認して REVOKED にする。
 * Route から deleteKey 処理後にベストエフォートで呼べる補助。
 */
export async function confirmRevokeFromWebhookSuccess(input: {
  readonly deviceMac: string;
  readonly passcodeId: string;
  readonly switchbotKeyId: string;
}): Promise<boolean> {
  const credentials = await getDecryptedSwitchBotCredentialsForRevocation();
  if (!credentials) return false;

  return confirmRevokeByKeyAbsence(credentials, {
    id: input.passcodeId,
    switchbotKeyId: input.switchbotKeyId,
    device: { deviceId: input.deviceMac },
  });
}
