import type { BusinessHours } from "@/admin/actions/settings";

export {
  TIME_REGEX,
  hasOverlappingSlots,
} from "@/shared/lib/validations/business-hours";

// UI 側の即時エラー表示用型
export type SlotError = {
  day: keyof BusinessHours;
  slotIndex: number;
  field: "openTime" | "closeTime" | "overlap";
  message: string;
};
