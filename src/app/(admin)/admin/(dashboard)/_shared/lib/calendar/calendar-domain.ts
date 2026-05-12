import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  isSameDay,
  addDays,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  format,
} from "date-fns";
import { ja } from "date-fns/locale";
import type {
  CalendarView,
  CalendarDateRange,
  CalendarEvent,
  EventPosition,
  PositionedEvent,
  BusinessHours,
} from "./calendar-types";
import { DEFAULT_BUSINESS_HOURS, PIXELS_PER_HOUR } from "./calendar-types";

/**
 * カレンダー日付範囲を計算
 */
export function getCalendarDateRange(
  date: Date,
  view: CalendarView,
): CalendarDateRange {
  let start: Date;
  let end: Date;

  switch (view) {
    case "month": {
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);
      start = startOfWeek(monthStart, { weekStartsOn: 0 });
      end = endOfWeek(monthEnd, { weekStartsOn: 0 });
      break;
    }
    case "week": {
      start = startOfWeek(date, { weekStartsOn: 0 });
      end = endOfWeek(date, { weekStartsOn: 0 });
      break;
    }
    case "day":
    case "resource": {
      start = startOfDay(date);
      end = endOfDay(date);
      break;
    }
  }

  const displayDates = eachDayOfInterval({ start, end });

  return { start, end, displayDates };
}

/**
 * 日付ナビゲーション: 次へ
 */
export function navigateNext(date: Date, view: CalendarView): Date {
  switch (view) {
    case "month":
      return addMonths(date, 1);
    case "week":
      return addWeeks(date, 1);
    case "day":
    case "resource":
      return addDays(date, 1);
  }
}

/**
 * 日付ナビゲーション: 前へ
 */
export function navigatePrevious(date: Date, view: CalendarView): Date {
  switch (view) {
    case "month":
      return subMonths(date, 1);
    case "week":
      return subWeeks(date, 1);
    case "day":
    case "resource":
      return subDays(date, 1);
  }
}

/**
 * 営業時間の時間枠を生成
 */
export function generateTimeSlots(
  hours: BusinessHours = DEFAULT_BUSINESS_HOURS,
  intervalMinutes: number = 60,
): string[] {
  const slots: string[] = [];
  const totalMinutes = (hours.endHour - hours.startHour) * 60;

  for (let min = 0; min < totalMinutes; min += intervalMinutes) {
    const hour = hours.startHour + Math.floor(min / 60);
    const minute = min % 60;
    slots.push(
      `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    );
  }

  return slots;
}

/**
 * イベントのグリッド位置を計算
 */
export function calculateEventPosition(
  event: CalendarEvent,
  hours: BusinessHours = DEFAULT_BUSINESS_HOURS,
  pixelsPerHour: number = PIXELS_PER_HOUR,
): EventPosition {
  const start = new Date(event.startTime);
  const end = new Date(event.endTime);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  const dayStartMinutes = hours.startHour * 60;
  const dayEndMinutes = hours.endHour * 60;

  // 範囲外クリッピング
  const clippedStart = Math.max(startMinutes, dayStartMinutes);
  const clippedEnd = Math.min(endMinutes, dayEndMinutes);

  const duration = Math.max(0, clippedEnd - clippedStart);
  const offset = Math.max(0, clippedStart - dayStartMinutes);

  return {
    top: (offset / 60) * pixelsPerHour,
    height: Math.max((duration / 60) * pixelsPerHour, 20), // 最小高さ20px
    left: 0,
    width: 100,
    zIndex: 1,
  };
}

/**
 * 重複イベントの配置を調整
 */
export function layoutOverlappingEvents(
  events: CalendarEvent[],
  hours: BusinessHours = DEFAULT_BUSINESS_HOURS,
  pixelsPerHour: number = PIXELS_PER_HOUR,
): PositionedEvent[] {
  if (events.length === 0) return [];

  // 開始時間でソート（ISO 8601 文字列は辞書順 = 時系列順）
  const sorted = [...events].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );

  // 重複グループを検出
  const groups: CalendarEvent[][] = [];
  let currentGroup: CalendarEvent[] = [];

  for (const event of sorted) {
    if (currentGroup.length === 0) {
      currentGroup.push(event);
      continue;
    }

    // 現在のグループと重複するか確認
    const hasOverlap = currentGroup.some(
      (e) => e.startTime < event.endTime && event.startTime < e.endTime,
    );

    if (hasOverlap) {
      currentGroup.push(event);
    } else {
      groups.push(currentGroup);
      currentGroup = [event];
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  // 各グループ内でカラム配置
  const result: PositionedEvent[] = [];

  for (const group of groups) {
    const columns: CalendarEvent[][] = [];

    for (const event of group) {
      let placed = false;

      for (const column of columns) {
        const lastInColumn = column[column.length - 1];
        if (lastInColumn && lastInColumn.endTime <= event.startTime) {
          column.push(event);
          placed = true;
          break;
        }
      }

      if (!placed) {
        columns.push([event]);
      }
    }

    const columnCount = columns.length;
    const columnWidth = 100 / columnCount;

    columns.forEach((column, colIndex) => {
      for (const event of column) {
        const position = calculateEventPosition(event, hours, pixelsPerHour);
        result.push({
          ...event,
          position: {
            ...position,
            left: colIndex * columnWidth,
            width: columnWidth - 1, // 1%のマージン
            zIndex: colIndex + 1,
          },
        });
      }
    });
  }

  return result;
}

/**
 * 指定日のイベントを取得
 */
export function getEventsForDay(
  events: CalendarEvent[],
  day: Date,
): CalendarEvent[] {
  return events.filter((event) => isSameDay(new Date(event.startTime), day));
}

/**
 * ステータス別色クラスを取得（カレンダーイベント用）
 *
 * デザイン方針:
 * - 左 border は意味色（強）— 一目でステータス識別可能
 * - 背景は意味色の弱い tint — 読みやすさ優先
 * - テキストは foreground 系 — 小さいセル内でもコントラスト確保（WCAG 1.4.3 AA）
 * - CANCELLED は opacity 落として控えめに（取消線は EventCell 内で個別適用）
 */
export function getStatusColorClass(status: string): string {
  switch (status) {
    case "PENDING":
      return "bg-warning/15 border-l-warning text-foreground hover:bg-warning/25";
    case "CONFIRMED":
      return "bg-success/15 border-l-success text-foreground hover:bg-success/25";
    case "COMPLETED":
      return "bg-muted border-l-muted-foreground text-foreground hover:bg-muted/80";
    case "NO_SHOW":
      return "bg-destructive/15 border-l-destructive text-foreground hover:bg-destructive/25";
    case "CANCELLED":
      return "bg-muted/40 border-l-muted-foreground text-muted-foreground hover:bg-muted/60";
    default:
      return "bg-info/15 border-l-info text-foreground hover:bg-info/25";
  }
}

/**
 * スペース別色クラスを取得（ハッシュベース）
 */
export function getSpaceColorClass(spaceId: string, index?: number): string {
  const colors = [
    "border-l-cal-1",
    "border-l-cal-2",
    "border-l-cal-3",
    "border-l-cal-4",
    "border-l-cal-5",
    "border-l-cal-6",
    "border-l-cal-7",
    "border-l-cal-8",
  ];

  if (index !== undefined) {
    return colors[index % colors.length] ?? colors[0] ?? "border-l-cal-1";
  }

  const hash = spaceId
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length] ?? colors[0] ?? "border-l-cal-1";
}

/**
 * 日付ラベルをフォーマット
 */
export function formatDateLabel(date: Date, view: CalendarView): string {
  switch (view) {
    case "month":
      return format(date, "yyyy年M月", { locale: ja });
    case "week": {
      const weekStart = startOfWeek(date, { weekStartsOn: 0 });
      const weekEnd = endOfWeek(date, { weekStartsOn: 0 });
      return `${format(weekStart, "M月d日", { locale: ja })} - ${format(weekEnd, "M月d日", { locale: ja })}`;
    }
    case "day":
    case "resource":
      return format(date, "yyyy年M月d日 (E)", { locale: ja });
  }
}

/**
 * 曜日ヘッダーを生成
 */
export function getWeekdayHeaders(): string[] {
  return ["日", "月", "火", "水", "木", "金", "土"];
}

/**
 * 曜日の色クラスを取得
 */
export function getWeekdayColorClass(dayIndex: number): string {
  if (dayIndex === 0) return "text-destructive"; // 日曜
  if (dayIndex === 6) return "text-info"; // 土曜
  return "";
}
