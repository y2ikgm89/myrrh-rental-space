/**
 * 公開イベント表示用の日時フォーマット helper。
 *
 * 実装は SSoT の `src/shared/lib/date-format.ts` にすべて委譲する。
 * 独自 Intl.DateTimeFormat を再定義しない (旧実装で 8 種類重複していた分の再統合)。
 * 命名 (`formatEventDateTimeRange` / `formatEventDate` 等) は公開イベント経路の
 * 呼び出し側の可読性を保つためのラッパーで、内部は date-format.ts の JST 固定
 * helper と formatPrice のみで構成する。
 */

import {
  formatDateWithWeekday,
  formatJstDateString,
  formatJstDayOfMonth,
  formatJstWeekdayShort,
  formatTimeShort,
  formatYearMonth,
} from "@/shared/lib/date-format";
import { formatPrice } from "@/shared/lib/pricing/format";

export function formatEventDateTimeRange(
  startTime: string,
  endTime: string,
): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return `${formatDateWithWeekday(start)} ${formatTimeShort(start)} - ${formatTimeShort(end)}`;
}

/** イベント開始日のみ（年・月・日・曜日）を `2026年5月15日(金)` 形式で返す。 */
export function formatEventDate(startTime: string): string {
  return formatDateWithWeekday(new Date(startTime));
}

/** 開始〜終了時刻のみを `10:00 - 12:00` 形式で返す。 */
export function formatEventTimeRange(
  startTime: string,
  endTime: string,
): string {
  return `${formatTimeShort(new Date(startTime))} - ${formatTimeShort(new Date(endTime))}`;
}

export function formatMonthYear(date: Date): string {
  return formatYearMonth(date);
}

export function formatDay(date: Date): string {
  return formatJstDayOfMonth(date);
}

export function formatWeekday(date: Date): string {
  return formatJstWeekdayShort(date);
}

export function formatTime(date: Date): string {
  return formatTimeShort(date);
}

/** JST の年・月(0-indexed)・日を返す */
export function getJSTDateParts(date: Date): {
  year: number;
  month: number;
  day: number;
} {
  const s = formatJstDateString(date);
  const [y, m, d] = s.split("-").map(Number);
  return { year: y ?? 0, month: (m ?? 1) - 1, day: d ?? 1 };
}

/** JST ベースの月キー (例: "2026-03") */
export function getJSTMonthKey(dateStr: string): string {
  const { year, month } = getJSTDateParts(new Date(dateStr));
  return `${String(year)}-${String(month).padStart(2, "0")}`;
}

/** ISO 文字列が指定 JST 日と同日か判定 */
export function isSameJSTDay(
  isoStr: string,
  year: number,
  month: number,
  day: number,
): boolean {
  const jst = getJSTDateParts(new Date(isoStr));
  return jst.year === year && jst.month === month && jst.day === day;
}

export function formatEventPrice(price: number): string {
  if (price === 0) return "無料";
  return formatPrice(price);
}
