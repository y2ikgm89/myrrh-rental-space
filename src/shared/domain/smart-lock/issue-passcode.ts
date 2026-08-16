/**
 * 予約確定時のSwitchBotスマートロック用パスコード自動発行
 *
 * createKey コマンド成否の正本は webhook（`webhook-commands.ts`）。
 * Device List の疎 poll は keyId 物質化と webhook 遅延時の楽観確定の副経路。
 *
 * @module shared/domain/smart-lock/issue-passcode
 */

import "server-only";
import { randomInt } from "crypto";
import { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { encrypt, safeDecryptToString } from "@/shared/lib/crypto";
import { getDecryptedSwitchBotCredentials } from "@/shared/domain/settings/api-key-queries";
import {
  createPasscode,
  findKeyInDeviceList,
  type SwitchBotCredentials,
} from "@/shared/lib/smart-lock/switchbot-client";
import { SmartLockPasscodeStatus } from "@/shared/lib/validations/enums/prisma-types";
import { isSmartLockPadDeviceType } from "@/shared/lib/validations/enums/helpers";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { fireAndForget } from "@/shared/lib/async-utils";

/**
 * SwitchBot passcode 発行が失敗した際、admin 通知を発火して silent 障害を可視化する。
 * fireAndForget で送信失敗が予約書込を巻き添えにしないよう分離する
 * (通知 DB 書込 self-error は logError で拾う)。
 */
function notifyPasscodeFailure(input: {
  reservationId: string;
  reason: string;
}): void {
  fireAndForget(
    createNotificationCommand({
      type: NOTIFICATION_TYPE.SMART_LOCK_PASSCODE_FAILED,
      title:
        NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.SMART_LOCK_PASSCODE_FAILED],
      message: `予約 ${input.reservationId} のスマートロックパスコード発行に失敗しました: ${input.reason}`,
      resourceType: "reservation",
      resourceId: input.reservationId,
    }),
    {
      operation: "notifySmartLockPasscodeFailure",
      category: ErrorCategory.DATABASE,
    },
  );
}

/** Settingsの暗号化フィールドとは無関係のローカルpurpose（SETTINGS_CRYPTO_PURPOSESには含めない）。 */
export const PASSCODE_CRYPTO_PURPOSE = "switchbot-guest-passcode";

/** Device List 疎 poll の開始からのオフセット（ms）。最大 5 回 / 45s。 */
const DEVICE_LIST_POLL_OFFSETS_MS = [0, 5_000, 15_000, 30_000, 45_000] as const;

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

/**
 * `issueSmartLockPasscodes` の戻り値。呼出側が「発行成功 (passcodes 非空)」
 * 「発行失敗 (issuanceFailed=true)」「対象デバイスなし (issuanceFailed=false かつ空)」
 * を区別できるようにする (PR#12)。
 *
 * - passcodes: 発行成功した passcode の配列
 * - issuanceFailed: 対象スペースに smartLockDevice が割り当てられているのに
 *   発行に失敗した場合のみ true。confirmation メールで代替入室手段の案内文言を
 *   出すかどうかの判定に使う。
 */
export type IssueSmartLockPasscodesResult = {
  readonly passcodes: IssuedSmartLockPasscode[];
  readonly issuanceFailed: boolean;
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
  const passcode = safeDecryptToString(passcodeCiphertext, {
    expectedPurpose: PASSCODE_CRYPTO_PURPOSE,
  });
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

async function confirmPasscodeFromKeyList(
  passcodeRowId: string,
  keyId: string,
  deviceName: string,
  password: string,
): Promise<IssuedSmartLockPasscode | null> {
  const updated = await prisma.smartLockPasscode.updateMany({
    where: { id: passcodeRowId, status: SmartLockPasscodeStatus.PENDING },
    data: {
      status: SmartLockPasscodeStatus.CONFIRMED,
      switchbotKeyId: keyId,
      confirmedAt: new Date(),
    },
  });
  if (updated.count === 0) {
    // 同一のcreateKey呼出・同一の物理パスコードに対する別経路（webhook）の
    // 確定と競合した。既にCONFIRMEDならこの呼び出しのpasswordをそのまま
    // 返してよい（webhookが記録したswitchbotKeyIdも同じkeyListエントリを
    // 指すため）。FAILEDに倒れていた場合のみ発行失敗として扱う。
    const current = await prisma.smartLockPasscode.findUnique({
      where: { id: passcodeRowId },
      select: { status: true },
    });
    if (current?.status === SmartLockPasscodeStatus.CONFIRMED) {
      return { deviceName, passcode: password };
    }
    return null;
  }
  return { deviceName, passcode: password };
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
    notifyPasscodeFailure({
      reservationId: input.reservationId,
      reason: `SwitchBot createKey 失敗: ${createResult.message}`,
    });
    return null;
  }

  const commandId = createResult.body.commandId;
  await prisma.smartLockPasscode.update({
    where: { id: passcodeRow.id },
    data: {
      ...(commandId !== undefined && { switchbotCommandId: commandId }),
    },
  });

  for (
    let attempt = 0;
    attempt < DEVICE_LIST_POLL_OFFSETS_MS.length;
    attempt++
  ) {
    if (attempt > 0) {
      const currentOffset = DEVICE_LIST_POLL_OFFSETS_MS[attempt] ?? 0;
      const previousOffset = DEVICE_LIST_POLL_OFFSETS_MS[attempt - 1] ?? 0;
      await sleep(currentOffset - previousOffset);
    }

    const keyResult = await findKeyInDeviceList(
      credentials,
      device.deviceId,
      name,
    );
    if (!keyResult.ok || keyResult.body === null) continue;

    const confirmed = await confirmPasscodeFromKeyList(
      passcodeRow.id,
      keyResult.body.id,
      device.deviceName,
      password,
    );
    if (confirmed) {
      return confirmed;
    }
    return null;
  }

  // Device List poll がタイムアウトしても **status は PENDING のまま残す**。
  //
  // webhook（正本）が createKey success/failed/timeout を届ける余地を残す。
  // 成否の失敗確定は webhook failed/timeout または stale cron に委譲する。
  // 楽観確定（Device List に key が出現）は上記 poll で試行済み。
  logError(
    new Error(
      "SwitchBot passcode confirmation timed out (status left PENDING for webhook)",
    ),
    {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "issueSmartLockPasscode",
        reservationId: input.reservationId,
        deviceRowId: device.id,
        passcodeRowId: passcodeRow.id,
      },
    },
  );
  notifyPasscodeFailure({
    reservationId: input.reservationId,
    reason:
      "SwitchBot からの確定通知が 45 秒以内に届かず PENDING のまま (webhook 到着で自動リカバリの可能性あり)",
  });
  return null;
}

/**
 * 予約に紐づくスペースに割り当てられたスマートロックデバイスへ一時パスコードを発行する。
 *
 * - スペースにデバイス未割り当て、またはデバイスが無効化されている場合は no-op で
 *   空配列を返す（戻り値は将来の複数デバイス対応も見据えて配列のまま維持するが、
 *   現在は0または1要素）。
 * - 錠タイプ（LOCK / LOCK_LITE / LOCK_PRO）はパスコード発行対象外。割当されていても
 *   no-op（guard）。
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
): Promise<IssueSmartLockPasscodesResult> {
  try {
    const space = await prisma.space.findUnique({
      where: { id: input.spaceId },
      select: { smartLockDevice: true },
    });
    const device = space?.smartLockDevice;
    // デバイスなし or 無効化 = そもそも発行対象外 (failure ではない)
    if (!device || !device.isActive) {
      return { passcodes: [], issuanceFailed: false };
    }

    // 錠タイプは Space 割当対象外だが、誤割当ガードとして no-op
    if (!isSmartLockPadDeviceType(device.deviceType)) {
      return { passcodes: [], issuanceFailed: false };
    }

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
      notifyPasscodeFailure({
        reservationId: input.reservationId,
        reason:
          "SmartLockDevice が割り当てられているが SwitchBot 連携が未設定/無効",
      });
      // デバイス設定済みなのに credentials 欠損 = 発行失敗として顧客メールにも案内
      return { passcodes: [], issuanceFailed: true };
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
        return resolved
          ? { passcodes: [resolved], issuanceFailed: false }
          : { passcodes: [], issuanceFailed: true };
      }
      if (existing.status === SmartLockPasscodeStatus.REVOKE_PENDING) {
        // deleteKey 受理後の失効待ち。reissue path は edit-side-effects が
        // createKey 前に revoke 完了を待つが、ここに到達 = 新 key 未発行。
        // silent no-op (issuanceFailed:false) は禁止 — fallback を出す。
        return { passcodes: [], issuanceFailed: true };
      }
      if (existing.status === SmartLockPasscodeStatus.FAILED) {
        await prisma.smartLockPasscode.delete({
          where: { id: existing.id },
        });
      } else {
        // PENDING = createKey 進行中。
        return {
          passcodes: [],
          issuanceFailed: false,
        };
      }
    }

    const issued = await issueForDevice(
      device,
      input,
      credentials,
      credentials.passcodeBufferMinutes,
    );
    return issued
      ? { passcodes: [issued], issuanceFailed: false }
      : { passcodes: [], issuanceFailed: true };
  } catch (error) {
    const normalized = normalizeError(error);
    logError(normalized, {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "issueSmartLockPasscodes",
        reservationId: input.reservationId,
        spaceId: input.spaceId,
      },
    });
    notifyPasscodeFailure({
      reservationId: input.reservationId,
      reason: `予期しないエラー: ${normalized.message}`,
    });
    return { passcodes: [], issuanceFailed: true };
  }
}
