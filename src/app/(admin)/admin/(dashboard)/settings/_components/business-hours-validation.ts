import type { BusinessHours, BusinessTimeSlot } from "@/admin/actions/settings";

// 時刻フォーマット検証
export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// 時間帯の重複チェック
export function hasOverlappingSlots(slots: BusinessTimeSlot[]): boolean {
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      if (a && b && a.openTime < b.closeTime && a.closeTime > b.openTime) {
        return true;
      }
    }
  }
  return false;
}

// エラー型
export type SlotError = {
  day: keyof BusinessHours;
  slotIndex: number;
  field: "openTime" | "closeTime" | "overlap";
  message: string;
};
