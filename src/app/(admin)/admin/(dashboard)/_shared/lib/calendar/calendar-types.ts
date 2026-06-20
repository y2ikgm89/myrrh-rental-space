import type { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";

/**
 * カレンダービュータイプ
 *
 * - month/week/day: 標準的な時間軸カレンダー
 * - resource: スペース別ビュー (1日 × スペース列) — Cal.com / FullCalendar resourceTimeGrid / Google Calendar Resource 標準パターン
 */
export type CalendarView = "month" | "week" | "day" | "resource";

const CALENDAR_VIEWS: readonly CalendarView[] = [
  "month",
  "week",
  "day",
  "resource",
];

/**
 * CalendarViewのSet（O(1) lookup用）
 */
const CALENDAR_VIEWS_SET = new Set<string>(CALENDAR_VIEWS);

/**
 * CalendarViewの型ガード（内部使用）
 */
function isValidCalendarView(value: string): value is CalendarView {
  return CALENDAR_VIEWS_SET.has(value);
}

/**
 * CalendarViewのバリデーション付き取得
 */
export function getValidCalendarView(
  value: string | null | undefined,
  fallback: CalendarView = "week",
): CalendarView {
  return value && isValidCalendarView(value) ? value : fallback;
}

/**
 * カレンダーイベント（予約の表示用型）
 *
 * Server→Client 境界を経由するため、startTime/endTime は
 * ISO 8601 形式の文字列として受け取る。
 */
export interface CalendarEvent {
  id: string;
  title: string;
  spaceId: string;
  spaceName: string;
  /** ISO 8601 文字列（例: "2024-03-15T09:00:00.000Z"） */
  startTime: string;
  /** ISO 8601 文字列（例: "2024-03-15T11:00:00.000Z"） */
  endTime: string;
  status: ReservationStatus;
  totalPrice: number | null;
  notes: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
}

/**
 * イベント配置情報（グリッド計算用）
 */
export interface EventPosition {
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
}

/**
 * 配置済みイベント
 */
export type PositionedEvent = CalendarEvent & { position: EventPosition };

/**
 * カレンダー日付範囲
 */
export interface CalendarDateRange {
  start: Date;
  end: Date;
  displayDates: Date[];
}

/**
 * スペースフィルターオプション
 */
export interface SpaceOption {
  id: string;
  name: string;
}

/**
 * カレンダー表示モード
 */
export type DisplayMode = "unified" | "filtered" | "split";

/**
 * 営業時間設定
 */
export interface BusinessHours {
  startHour: number;
  endHour: number;
}

/**
 * デフォルト営業時間
 */
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  startHour: 9,
  endHour: 21,
};

/**
 * カレンダーレイアウト共通定数 (SSoT)
 *
 * 全 view (Month/Week/Day/Resource) で参照する pixel 系定数の単一参照点。
 * 各 view にコピーされた `DAY_COLUMN_MIN_PX` / `SUBCOLUMN_MIN_PX` /
 * `MIN_COLUMN_WIDTH` 相当をここに集約する。
 */
export const CALENDAR_LAYOUT = {
  /** 1 時間あたりの pixel */
  pixelsPerHour: 60,
  /** 時刻カラム (TimeGrid 左端) の幅 */
  timeColumnWidthPx: 60,
  /** WeekView の各日カラム最小幅 (重複なし時) */
  weekColumnMinPx: 140,
  /** WeekView の重複イベント 1 サブカラム最小幅 — WCAG 2.5.5 / 文字 + アイコンが収まる最低限 */
  weekSubcolumnMinPx: 80,
  /** DayView の単一日カラム最小幅 (1fr で広がるが極端な狭幅を避ける) */
  dayColumnMinPx: 320,
  /** DayView の重複イベント 1 サブカラム最小幅 */
  daySubcolumnMinPx: 120,
  /** ResourceView の各スペースカラム最小幅 */
  resourceColumnMinPx: 160,
} as const;
