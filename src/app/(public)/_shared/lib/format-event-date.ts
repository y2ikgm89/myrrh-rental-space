import { formatPrice } from "@/shared/lib/pricing/format";

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatEventDateTimeRange(
  startTime: string,
  endTime: string,
): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const datePart = dateFormatter.format(start);
  const startTimePart = timeFormatter.format(start);
  const endTimePart = timeFormatter.format(end);
  return `${datePart} ${startTimePart} - ${endTimePart}`;
}

/** イベント開始日のみ（年・月・日・曜日）を `2026年5月15日(金)` 形式で返す。 */
export function formatEventDate(startTime: string): string {
  return dateFormatter.format(new Date(startTime));
}

/** 開始〜終了時刻のみを `10:00 - 12:00` 形式で返す。 */
export function formatEventTimeRange(
  startTime: string,
  endTime: string,
): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return `${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
}

const monthYearFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
});

const dayOnlyFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  day: "numeric",
});

const weekdayOnlyFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  weekday: "short",
});

const timeOnlyFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
});

const jstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
});

export function formatMonthYear(date: Date): string {
  return monthYearFormatter.format(date);
}

export function formatDay(date: Date): string {
  return dayOnlyFormatter.format(date);
}

export function formatWeekday(date: Date): string {
  return weekdayOnlyFormatter.format(date);
}

export function formatTime(date: Date): string {
  return timeOnlyFormatter.format(date);
}

/** JST の年・月(0-indexed)・日を返す */
export function getJSTDateParts(date: Date): {
  year: number;
  month: number;
  day: number;
} {
  const s = jstDateFormatter.format(date);
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
