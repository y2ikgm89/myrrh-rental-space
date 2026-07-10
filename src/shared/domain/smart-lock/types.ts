import type { SmartLockDeviceType } from "@generated/prisma/enums";

/**
 * スマートロックデバイス（SmartLockDevice）の表示用データ。
 *
 * SwitchBot 側の Keypad 系アクセサリ・Lock Vision Pro 単体を表す。1 スペースに
 * 複数台（玄関 + 室内ドア等）を許容するため 1:N。パスコード発行ロジック（PR2）は
 * このタスクの範囲外。
 *
 * `createdAt` / `updatedAt` は ISO 8601 文字列。
 */
export type SmartLockDeviceData = {
  readonly id: string;
  readonly spaceId: string;
  /** SwitchBot 側の device ID（MAC アドレス） */
  readonly deviceId: string;
  readonly deviceName: string;
  readonly deviceType: SmartLockDeviceType;
  readonly isActive: boolean;
  /** ISO 8601 */
  readonly createdAt: string;
  /** ISO 8601 */
  readonly updatedAt: string;
};
