/**
 * 営業時間（BusinessHours）の共有バリデーションヘルパー
 *
 * Zod スキーマ（`basic.ts` / `location.ts`）と UI フォーム検証（`BusinessHoursSection`）の両方で
 * 同一ロジックを使用するため、ここに集約する。
 */

import { z } from "zod";

/**
 * HH:mm（00:00-23:59）形式の時刻
 */
export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * 時間帯の最小形
 */
export interface BusinessTimeSlot {
  readonly openTime: string;
  readonly closeTime: string;
}

/**
 * 時間帯配列内に重複（オーバーラップ）が存在するか判定する。
 *
 * 重複判定: `a.openTime < b.closeTime && a.closeTime > b.openTime`
 */
export function hasOverlappingSlots(
  slots: readonly BusinessTimeSlot[],
): boolean {
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      if (!a || !b) continue;
      if (a.openTime < b.closeTime && a.closeTime > b.openTime) {
        return true;
      }
    }
  }
  return false;
}

/**
 * `{ isOpen, slots }` 構造の 1 曜日分のバリデーション本体。
 *
 * Zod の `.superRefine()` コールバックから呼び出す想定。
 * issue の `path` は呼び出し側で prefix（例: `["businessHours", "monday"]`）を指定する。
 */
export function collectBusinessHoursDayIssues(
  day: {
    readonly isOpen: boolean;
    readonly slots: readonly BusinessTimeSlot[];
  },
  pathPrefix: readonly (string | number)[],
  ctx: z.RefinementCtx,
): void {
  // 営業日なのに時間帯がない
  if (day.isOpen && day.slots.length === 0) {
    ctx.addIssue({
      code: "custom",
      message: "営業日には最低1つの時間帯を設定してください",
      path: [...pathPrefix, "slots"],
    });
  }

  // 各 slot の時刻順序
  day.slots.forEach((slot, index) => {
    if (slot.closeTime <= slot.openTime) {
      ctx.addIssue({
        code: "custom",
        message: "終了時刻は開始時刻より後にしてください",
        path: [...pathPrefix, "slots", index, "closeTime"],
      });
    }
  });

  // 重複
  if (day.isOpen && day.slots.length > 1 && hasOverlappingSlots(day.slots)) {
    ctx.addIssue({
      code: "custom",
      message: "時間帯が重複しています",
      path: [...pathPrefix, "slots"],
    });
  }
}

/**
 * 週全体（7 曜日分）のバリデーション。
 *
 * `.superRefine()` コールバックから呼び出す。
 */
export function collectBusinessHoursWeekIssues(
  week: Record<
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday",
    { readonly isOpen: boolean; readonly slots: readonly BusinessTimeSlot[] }
  >,
  pathPrefix: readonly (string | number)[],
  ctx: z.RefinementCtx,
): void {
  const days = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ] as const;
  for (const day of days) {
    collectBusinessHoursDayIssues(week[day], [...pathPrefix, day], ctx);
  }
}
