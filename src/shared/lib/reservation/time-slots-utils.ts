/**
 * 時間枠生成ロジック - ユーティリティ関数（Client-safe）
 *
 * このファイルの関数はServer-onlyな依存を持たず、
 * Client Componentからも安全にインポートできます。
 */

import type { BusinessHours } from "@/shared/lib/json-validators";
import { DEFAULT_BUSINESS_HOURS } from "./constants";
import type { TimeSlot } from "./types";

/** スロットの時間間隔（分） */
const SLOT_INTERVAL_MINUTES = 30;

type WeekdayKey =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

const WEEKDAY_KEYS: readonly WeekdayKey[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/**
 * 日付から曜日キーを取得
 */
export function getWeekdayKey(date: Date): WeekdayKey {
  return WEEKDAY_KEYS[date.getDay()] ?? "sunday";
}

/**
 * カレンダー上の Date を表示上の暦日 `"YYYY-MM-DD"` に変換する（ローカル日付ベース）。
 * 予約スロット取得・blocked date 判定で共通利用する SSoT。
 */
export function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 時刻文字列を時・分に分解
 */
export function parseTime(time: string): { hour: number; minute: number } {
  const parts = time.split(":").map(Number);
  return { hour: parts[0] ?? 0, minute: parts[1] ?? 0 };
}

/**
 * 営業時間設定から時間枠を生成
 *
 * @param businessHours - 営業時間設定
 * @param date - 日付（YYYY-MM-DD形式）
 * @returns 営業時間内の時間枠（30分刻み）
 */
export function generateSlotsFromBusinessHours(
  businessHours: BusinessHours | null,
  date: string,
): TimeSlot[] {
  const targetDate = new Date(`${date}T00:00:00`);
  const weekday = getWeekdayKey(targetDate);

  // 営業時間設定がない場合はフォールバック
  if (!businessHours) {
    return generateFallbackSlots();
  }

  const daySettings = businessHours[weekday];

  // 休業日の場合は空配列
  if (!daySettings.isOpen || daySettings.slots.length === 0) {
    return [];
  }

  const slots: TimeSlot[] = [];

  // 各営業時間帯からスロットを生成
  for (const timeSlot of daySettings.slots) {
    const start = parseTime(timeSlot.openTime);
    const end = parseTime(timeSlot.closeTime);
    const startMinutes = start.hour * 60 + start.minute;
    const endMinutes = end.hour * 60 + end.minute;

    // 開始時刻から終了時刻まで30分刻みでスロットを生成
    for (let m = startMinutes; m < endMinutes; m += SLOT_INTERVAL_MINUTES) {
      const hour = Math.floor(m / 60);
      const minute = m % 60;
      slots.push({
        time: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
        available: true,
      });
    }
  }

  // 重複を除去してソート
  const uniqueSlots = Array.from(
    new Map(slots.map((s) => [s.time, s])).values(),
  ).sort((a, b) => a.time.localeCompare(b.time));

  return uniqueSlots;
}

/**
 * フォールバック用スロット生成（営業時間設定がない場合）
 */
export function generateFallbackSlots(): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const startMinutes = DEFAULT_BUSINESS_HOURS.start * 60;
  const endMinutes = DEFAULT_BUSINESS_HOURS.end * 60;

  for (let m = startMinutes; m < endMinutes; m += SLOT_INTERVAL_MINUTES) {
    const hour = Math.floor(m / 60);
    const minute = m % 60;
    slots.push({
      time: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
      available: true,
    });
  }
  return slots;
}

/** 時刻文字列（HH:MM）に指定分数を加算して HH:MM を返す */
export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const totalMinutes = (h ?? 0) * 60 + (m ?? 0) + minutes;
  const newH = Math.floor(totalMinutes / 60);
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}
