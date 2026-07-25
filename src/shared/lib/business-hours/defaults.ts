import type {
  BusinessHours,
  BusinessHoursDay,
  BusinessTimeSlot,
} from "@/shared/lib/json-validators";

/** 連続営業テンプレートと同一の既定スロット（09:00–21:00） */
export const DEFAULT_OPEN_SLOT: BusinessTimeSlot = {
  openTime: "09:00",
  closeTime: "21:00",
};

/** 曜日の営業/休業に応じた 1 日分の既定値を生成する */
export function createDefaultBusinessHoursDay(
  isOpen: boolean,
): BusinessHoursDay {
  return isOpen
    ? { isOpen: true, slots: [DEFAULT_OPEN_SLOT] }
    : { isOpen: false, slots: [] };
}

/**
 * 組織・ロケーション未設定時の週間営業時間 SSoT。
 * 月〜土 09:00–21:00、日曜休業（管理画面 BusinessHoursSection と一致）。
 */
export const DEFAULT_BUSINESS_HOURS_WEEK: BusinessHours = {
  monday: createDefaultBusinessHoursDay(true),
  tuesday: createDefaultBusinessHoursDay(true),
  wednesday: createDefaultBusinessHoursDay(true),
  thursday: createDefaultBusinessHoursDay(true),
  friday: createDefaultBusinessHoursDay(true),
  saturday: createDefaultBusinessHoursDay(true),
  sunday: createDefaultBusinessHoursDay(false),
};
