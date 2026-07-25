/**
 * 毎月定休（monthlyClosures）の公開向け表示ラベル。
 *
 * admin の BusinessHoursSection と footer / contact の営業時間表示で共有する。
 */

import {
  parseBusinessHours,
  type MonthlyClosure,
  type MonthlyClosureWeek,
} from "@/shared/lib/json-validators";
import type { Prisma } from "@/shared/lib/validations/enums/prisma-types";

const MONTHLY_CLOSURE_WEEK_LABELS: Record<MonthlyClosureWeek, string> = {
  first: "第1",
  second: "第2",
  third: "第3",
  fourth: "第4",
  last: "最終",
};

const WEEKDAY_LABELS: Record<MonthlyClosure["weekday"], string> = {
  sunday: "日曜日",
  monday: "月曜日",
  tuesday: "火曜日",
  wednesday: "水曜日",
  thursday: "木曜日",
  friday: "金曜日",
  saturday: "土曜日",
};

/** 単一ルールを「第3月曜日」形式に整形する */
export function formatMonthlyClosureLabel(closure: MonthlyClosure): string {
  return `${MONTHLY_CLOSURE_WEEK_LABELS[closure.week]}${WEEKDAY_LABELS[closure.weekday]}`;
}

/**
 * businessHours JSON から毎月定休の短い表示行を返す（例: 「第3月曜日 定休」）。
 * businessHours が null / 不正 / monthlyClosures 未設定の場合は空配列。
 */
export function parseMonthlyClosuresForDisplay(
  businessHours: unknown,
): string[] {
  const parsed = parseBusinessHours(
    businessHours as Prisma.JsonValue | null | undefined,
  );
  if (!parsed?.monthlyClosures?.length) {
    return [];
  }
  return parsed.monthlyClosures.map(
    (closure) => `${formatMonthlyClosureLabel(closure)} 定休`,
  );
}
