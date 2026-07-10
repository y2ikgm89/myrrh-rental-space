import type { SmartLockDeviceType } from "@generated/prisma/enums";

/**
 * スマートロックデバイス（SmartLockDevice）の表示用データ。
 *
 * SwitchBot 側の Keypad 系アクセサリ・Lock Vision Pro 単体を表す。拠点（Location）に
 * 紐づく登録簿であり、同一 Location 内の複数 Space が同じ物理デバイスを共有できる
 * （各 Space はこの登録簿から最大 1 台を選ぶ、`Space.smartLockDeviceId`）。
 *
 * `createdAt` / `updatedAt` は ISO 8601 文字列。
 */
export type SmartLockDeviceData = {
  readonly id: string;
  readonly locationId: string;
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
