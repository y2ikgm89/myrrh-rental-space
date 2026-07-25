/**
 * 顧客向けスマートロックパスコードの可視性判定 + 条件付き decrypt
 *
 * 平文は `reveal: true` かつ全表示条件を満たすときのみ返す（Server Action 開示用）。
 * ページ初期 props には載せない。
 *
 * @module shared/domain/smart-lock/customer-passcode-queries
 */

import "server-only";

import { prisma } from "@/shared/db/prisma";
import { safeDecryptToString } from "@/shared/lib/crypto";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import {
  ReservationStatus,
  SmartLockPasscodeStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { isSmartLockPadDeviceType } from "@/shared/lib/validations/enums/helpers";
import { PASSCODE_CRYPTO_PURPOSE } from "@/shared/domain/smart-lock/issue-passcode";

export type CustomerPasscodeAuth =
  | { readonly kind: "customer"; readonly customerId: string }
  | { readonly kind: "status-token"; readonly reservationId: string };

export type CustomerVisiblePasscode = {
  readonly deviceName: string;
  readonly passcode: string;
};

export type CustomerVisiblePasscodesResult =
  | { readonly status: "unauthorized" }
  | { readonly status: "unavailable" }
  | { readonly status: "pending" }
  | { readonly status: "outside_window" }
  | {
      readonly status: "visible";
      readonly revealed: false;
      readonly deviceNames: readonly string[];
    }
  | {
      readonly status: "visible";
      readonly revealed: true;
      readonly passcodes: readonly CustomerVisiblePasscode[];
    };

export type GetCustomerVisiblePasscodesOptions = {
  readonly now?: Date;
  /**
   * true のときだけ CONFIRMED 行を decrypt して平文を返す。
   * UI の静的メッセージ判定では false（初期 HTML に平文を載せない）。
   */
  readonly reveal?: boolean;
};

function assertAuthMatchesReservation(
  reservationId: string,
  auth: CustomerPasscodeAuth,
  customerId: string,
): boolean {
  switch (auth.kind) {
    case "customer":
      return auth.customerId === customerId;
    case "status-token":
      return auth.reservationId === reservationId;
    default: {
      const _exhaustive: never = auth;
      return _exhaustive;
    }
  }
}

function isWithinPasscodeWindow(input: {
  readonly now: Date;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly bufferMinutes: number;
}): boolean {
  const bufferMs = input.bufferMinutes * 60_000;
  const windowStart = input.startTime.getTime() - bufferMs;
  const windowEnd = input.endTime.getTime() + bufferMs;
  const t = input.now.getTime();
  return t >= windowStart && t <= windowEnd;
}

/**
 * 予約に紐づく顧客可視パスコードの状態を解決する。
 *
 * 表示条件（すべて必須）:
 * 1. switchbotEnabled かつスペースに有効な Pad デバイス
 * 2. 予約 status === CONFIRMED
 * 3. SmartLockPasscode.status === CONFIRMED（PENDING は pending）
 * 4. now ∈ [start - buffer, end + buffer]
 *
 * Auth: 会員は customerId ownership、ゲストは status-token の rid 一致。
 */
export async function getCustomerVisibleSmartLockPasscodesForReservation(
  reservationId: string,
  auth: CustomerPasscodeAuth,
  options: GetCustomerVisiblePasscodesOptions = {},
): Promise<CustomerVisiblePasscodesResult> {
  const now = options.now ?? new Date();
  const reveal = options.reveal ?? false;

  if (auth.kind === "status-token" && auth.reservationId !== reservationId) {
    return { status: "unauthorized" };
  }

  const [settings, reservation] = await Promise.all([
    prisma.settingsSwitchbot.findUnique({
      where: { id: "singleton" },
      select: {
        switchbotEnabled: true,
        switchbotPasscodeBufferMinutes: true,
      },
    }),
    prisma.reservation.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        customerId: true,
        status: true,
        startTime: true,
        endTime: true,
        space: {
          select: {
            smartLockDevice: {
              select: {
                id: true,
                deviceName: true,
                deviceType: true,
                isActive: true,
              },
            },
          },
        },
      },
    }),
  ]);

  if (!reservation) {
    return { status: "unauthorized" };
  }

  if (
    !assertAuthMatchesReservation(reservationId, auth, reservation.customerId)
  ) {
    return { status: "unauthorized" };
  }

  if (!settings?.switchbotEnabled) {
    return { status: "unavailable" };
  }

  const device = reservation.space.smartLockDevice;
  if (
    !device ||
    !device.isActive ||
    !isSmartLockPadDeviceType(device.deviceType)
  ) {
    return { status: "unavailable" };
  }

  if (reservation.status !== ReservationStatus.CONFIRMED) {
    return { status: "unavailable" };
  }

  const passcodeRows = await prisma.smartLockPasscode.findMany({
    where: {
      reservationId,
      deviceId: device.id,
    },
    select: {
      id: true,
      status: true,
      passcodeCiphertext: true,
      device: { select: { id: true, deviceName: true } },
    },
  });

  if (passcodeRows.length === 0) {
    // 発行未完了（create 前）も「手続き中」として扱う
    return { status: "pending" };
  }

  const hasPending = passcodeRows.some(
    (row) => row.status === SmartLockPasscodeStatus.PENDING,
  );
  const confirmedRows = passcodeRows.filter(
    (row) => row.status === SmartLockPasscodeStatus.CONFIRMED,
  );

  if (confirmedRows.length === 0) {
    if (hasPending) {
      return { status: "pending" };
    }
    return { status: "unavailable" };
  }

  if (
    !isWithinPasscodeWindow({
      now,
      startTime: reservation.startTime,
      endTime: reservation.endTime,
      bufferMinutes: settings.switchbotPasscodeBufferMinutes,
    })
  ) {
    return { status: "outside_window" };
  }

  const deviceNames = confirmedRows.map((row) => row.device.deviceName);

  if (!reveal) {
    return {
      status: "visible",
      revealed: false,
      deviceNames,
    };
  }

  const passcodes: CustomerVisiblePasscode[] = [];
  for (const row of confirmedRows) {
    const passcode = safeDecryptToString(row.passcodeCiphertext, {
      expectedPurpose: PASSCODE_CRYPTO_PURPOSE,
    });
    if (passcode === null) {
      logError(new Error("顧客開示用パスコードの復号に失敗しました"), {
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.HIGH,
        context: {
          operation: "getCustomerVisibleSmartLockPasscodesForReservation",
          reservationId,
          passcodeRowId: row.id,
        },
      });
      continue;
    }
    passcodes.push({
      deviceName: row.device.deviceName,
      passcode,
    });
  }

  if (passcodes.length === 0) {
    return { status: "unavailable" };
  }

  return {
    status: "visible",
    revealed: true,
    passcodes,
  };
}
