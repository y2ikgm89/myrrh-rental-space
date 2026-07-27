import type { SmartLockDeviceType } from "@/shared/lib/validations/enums/prisma-types";

/**
 * スマートロックデバイス（SmartLockDevice）の表示用データ。
 *
 * - パッド（KEYPAD*）: 一時パスコード発行。Space / Location デフォルトに割当可。
 * - 錠（LOCK*）: 施錠状態・電池の監視のみ。
 *
 * `createdAt` / `updatedAt` / `lastStateAt` は ISO 8601 文字列。
 */
export type SmartLockDeviceData = {
  readonly id: string;
  readonly locationId: string;
  /** SwitchBot 側の device ID（MAC アドレス） */
  readonly deviceId: string;
  readonly deviceName: string;
  readonly deviceType: SmartLockDeviceType;
  readonly isActive: boolean;
  readonly pairedLockDeviceId: string | null;
  readonly lastLockState: string | null;
  readonly lastDoorState: string | null;
  readonly lastBattery: number | null;
  /** ISO 8601 or null */
  readonly lastStateAt: string | null;
  /** ISO 8601 */
  readonly createdAt: string;
  /** ISO 8601 */
  readonly updatedAt: string;
};
