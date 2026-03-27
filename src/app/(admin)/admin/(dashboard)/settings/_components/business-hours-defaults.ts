import type {
  BusinessHours,
  BusinessHoursDay,
  BusinessTimeSlot,
} from "@/admin/actions/settings";

// テンプレートキー
export const TEMPLATE_KEYS = ["continuous", "lunch-break", "custom"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

const TEMPLATE_KEY_SET = new Set<string>(TEMPLATE_KEYS);
export function isTemplateKey(value: string): value is TemplateKey {
  return TEMPLATE_KEY_SET.has(value);
}

// テンプレート定義
interface Template {
  label: string;
  description: string;
  slots: BusinessTimeSlot[];
}

export const TEMPLATES: Record<TemplateKey, Template> = {
  continuous: {
    label: "連続営業",
    description: "9:00〜21:00（休憩なし）",
    slots: [{ openTime: "09:00", closeTime: "21:00" }],
  },
  "lunch-break": {
    label: "昼休憩あり",
    description: "9:00〜12:00 / 13:00〜18:00",
    slots: [
      { openTime: "09:00", closeTime: "12:00" },
      { openTime: "13:00", closeTime: "18:00" },
    ],
  },
  custom: {
    label: "カスタム",
    description: "個別に設定",
    slots: [],
  },
};

// デフォルトスロット
export const DEFAULT_SLOT: BusinessTimeSlot = {
  openTime: "09:00",
  closeTime: "18:00",
};

// デフォルト曜日データ生成
export function createDefaultDay(isOpen: boolean): BusinessHoursDay {
  return isOpen
    ? { isOpen: true, slots: [{ openTime: "09:00", closeTime: "21:00" }] }
    : { isOpen: false, slots: [] };
}

// デフォルト営業時間
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  monday: createDefaultDay(true),
  tuesday: createDefaultDay(true),
  wednesday: createDefaultDay(true),
  thursday: createDefaultDay(true),
  friday: createDefaultDay(true),
  saturday: createDefaultDay(true),
  sunday: createDefaultDay(false),
};
