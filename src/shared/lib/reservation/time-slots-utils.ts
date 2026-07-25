/**
 * 時間枠生成ロジック - ユーティリティ関数（Client-safe）
 *
 * このファイルの関数はServer-onlyな依存を持たず、
 * Client Componentからも安全にインポートできます。
 */

import type {
  BusinessHours,
  MonthlyClosure,
} from "@/shared/lib/json-validators";
import { DEFAULT_BUSINESS_HOURS_WEEK } from "@/shared/lib/business-hours";
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
 * 指定日が「毎月の繰り返し定休（第N曜日）」に該当するか判定する純粋関数。
 * 例: `{ weekday: "monday", week: "third" }` は毎月第3月曜に該当。
 * `week: "last"` はその曜日の月内最終出現。ローカル日付ベース（getDay/getDate）。
 */
export function isMonthlyClosureDate(
  date: Date,
  closures: readonly MonthlyClosure[] | undefined,
): boolean {
  if (!closures || closures.length === 0) return false;

  const weekday = getWeekdayKey(date);
  const dayOfMonth = date.getDate();
  // 同曜日の月内 N 回目（1-5）
  const nthOccurrence = Math.floor((dayOfMonth - 1) / 7) + 1;
  // 月の日数（翌月 0 日 = 当月末日）
  const daysInMonth = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate();
  // 同曜日の月内最終出現か（7 日後が月をはみ出す）
  const isLastOccurrence = dayOfMonth + 7 > daysInMonth;

  return closures.some((closure) => {
    if (closure.weekday !== weekday) return false;
    if (closure.week === "last") return isLastOccurrence;
    const targetNth =
      closure.week === "first"
        ? 1
        : closure.week === "second"
          ? 2
          : closure.week === "third"
            ? 3
            : 4; // "fourth"
    return targetNth === nthOccurrence;
  });
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
  slotIntervalMinutes: number = SLOT_INTERVAL_MINUTES,
): TimeSlot[] {
  const effectiveHours = businessHours ?? DEFAULT_BUSINESS_HOURS_WEEK;
  const targetDate = new Date(`${date}T00:00:00`);
  const weekday = getWeekdayKey(targetDate);

  // 毎月の繰り返し定休（第N曜日）に該当する場合は空配列
  if (isMonthlyClosureDate(targetDate, effectiveHours.monthlyClosures)) {
    return [];
  }

  const daySettings = effectiveHours[weekday];

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

    // 開始時刻から終了時刻まで slotIntervalMinutes 刻みでスロットを生成
    for (let m = startMinutes; m < endMinutes; m += slotIntervalMinutes) {
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
 * フォールバック用スロット生成（営業時間設定が null のときの週間既定値）。
 * `generateSlotsFromBusinessHours(null, date)` と同等 — 日付ごとの曜日休業を反映する。
 */
export function generateFallbackSlots(
  slotIntervalMinutes: number = SLOT_INTERVAL_MINUTES,
  date: string,
): TimeSlot[] {
  return generateSlotsFromBusinessHours(
    DEFAULT_BUSINESS_HOURS_WEEK,
    date,
    slotIntervalMinutes,
  );
}

/** 時刻文字列（HH:MM）に指定分数を加算して HH:MM を返す */
export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const totalMinutes = (h ?? 0) * 60 + (m ?? 0) + minutes;
  const newH = Math.floor(totalMinutes / 60);
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

/**
 * スロット配列から予約枠の刻み幅（分）を推定する。
 * スロットは設定の defaultTimeSlot 間隔で生成されるため、先頭 2 件の差分が刻み幅。
 * 2 件未満なら既定（30 分）を返す。client 側の連続枠計算で server と刻みを揃えるための SSoT。
 */
export function deriveSlotIntervalMinutes(slots: readonly TimeSlot[]): number {
  const first = slots[0];
  const second = slots[1];
  if (!first || !second) return SLOT_INTERVAL_MINUTES;
  const a = parseTime(first.time);
  const b = parseTime(second.time);
  const diff = b.hour * 60 + b.minute - (a.hour * 60 + a.minute);
  return diff > 0 ? diff : SLOT_INTERVAL_MINUTES;
}

/** 時刻文字列（HH:MM）を 0 時からの分数に変換する。 */
function toMinutes(time: string): number {
  const { hour, minute } = parseTime(time);
  return hour * 60 + minute;
}

/**
 * 指定した date（YYYY-MM-DD）＋ startTime〜endTime（HH:MM）の窓が、営業時間内に
 * 完全に収まるかを判定する純粋関数。`generateSlotsFromBusinessHours` と同じ
 * 曜日・毎月定休判定（`getWeekdayKey`/`isMonthlyClosureDate`）を共有し、営業時間
 * ルールの二重実装を避ける。スロット刻みに依存しないため、任意の分単位の
 * startTime/endTime でも正しく判定できる（スロット列挙による整合チェックは
 * 刻みに合わない入力を誤判定しうるため採用しない）。
 *
 * `businessHours` が未設定（null）の場合は `DEFAULT_BUSINESS_HOURS_WEEK`
 * （月〜土 09:00–21:00、日曜休業）にフォールバックする。
 */
export function isWithinBusinessHours(
  businessHours: BusinessHours | null,
  date: string,
  startTime: string,
  endTime: string,
): boolean {
  const effectiveHours = businessHours ?? DEFAULT_BUSINESS_HOURS_WEEK;
  const startMinutes = toMinutes(startTime);
  const endMinutes = toMinutes(endTime);
  if (startMinutes >= endMinutes) return false;

  const targetDate = new Date(`${date}T00:00:00`);
  if (isMonthlyClosureDate(targetDate, effectiveHours.monthlyClosures)) {
    return false;
  }

  const daySettings = effectiveHours[getWeekdayKey(targetDate)];
  if (!daySettings.isOpen) return false;

  return daySettings.slots.some((slot) => {
    const openMinutes = toMinutes(slot.openTime);
    const closeMinutes = toMinutes(slot.closeTime);
    return startMinutes >= openMinutes && endMinutes <= closeMinutes;
  });
}

/**
 * 予約時間（分）が最小/最大予約時間の範囲内かを検証する純粋関数。
 * 範囲外ならエラーメッセージ、範囲内なら null を返す。
 * throw する create 経路と Result を返す update 経路の双方から共用する SSoT。
 */
export function checkReservationDuration(
  durationMinutes: number,
  rules: { minReservationDuration: number; maxReservationDuration: number },
): string | null {
  if (durationMinutes < rules.minReservationDuration) {
    return `予約時間は最短 ${rules.minReservationDuration} 分です`;
  }
  if (durationMinutes > rules.maxReservationDuration) {
    return `予約時間は最長 ${rules.maxReservationDuration} 分です`;
  }
  return null;
}
