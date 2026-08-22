import type { BusinessHours, BusinessTimeSlot } from "@/admin/actions/settings";
import {
  DEFAULT_BUSINESS_HOURS_WEEK,
  DEFAULT_OPEN_SLOT,
} from "@/shared/lib/business-hours";

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
    // 時刻を literal で書かない（監査 A-17）。既定スロットを変えたときに
    // ラベルだけが古い時間を名乗るのを防ぐ。先頭 0 の除去は他テンプレートの表記に揃えるため。
    description: `${DEFAULT_OPEN_SLOT.openTime.replace(/^0/u, "")}〜${DEFAULT_OPEN_SLOT.closeTime.replace(/^0/u, "")}（休憩なし）`,
    slots: [DEFAULT_OPEN_SLOT],
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

// デフォルト曜日データ生成（shared SSoT を re-export）
export { createDefaultBusinessHoursDay as createDefaultDay } from "@/shared/lib/business-hours";

// デフォルト営業時間（shared SSoT を re-export）
export const DEFAULT_BUSINESS_HOURS: BusinessHours =
  DEFAULT_BUSINESS_HOURS_WEEK;
