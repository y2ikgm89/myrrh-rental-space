import type { ReservationStatus } from "@generated/prisma/enums";

/**
 * カレンダービュータイプ
 */
export type CalendarView = "month" | "week" | "day";

const CALENDAR_VIEWS: readonly CalendarView[] = ["month", "week", "day"];

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
 * 1時間あたりのピクセル数
 */
export const PIXELS_PER_HOUR = 60;
