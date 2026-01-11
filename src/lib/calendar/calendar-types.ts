import type { ReservationStatus } from '@/generated/prisma/client/enums'

/**
 * カレンダービュータイプ
 */
export type CalendarView = 'month' | 'week' | 'day'

/**
 * カレンダーイベント（予約の表示用型）
 */
export interface CalendarEvent {
  id: string
  title: string
  spaceId: string
  spaceName: string
  startTime: Date
  endTime: Date
  status: ReservationStatus
  totalPrice: number | null
  notes: string | null
  customerName: string
  customerEmail: string
  customerPhone: string | null
}

/**
 * イベント配置情報（グリッド計算用）
 */
export interface EventPosition {
  top: number
  height: number
  left: number
  width: number
  zIndex: number
}

/**
 * 配置済みイベント
 */
export type PositionedEvent = CalendarEvent & { position: EventPosition }

/**
 * カレンダー日付範囲
 */
export interface CalendarDateRange {
  start: Date
  end: Date
  displayDates: Date[]
}

/**
 * スペースフィルターオプション
 */
export interface SpaceOption {
  id: string
  name: string
}

/**
 * カレンダー表示モード
 */
export type DisplayMode = 'unified' | 'filtered' | 'split'

/**
 * 営業時間設定
 */
export interface BusinessHours {
  startHour: number
  endHour: number
}

/**
 * デフォルト営業時間
 */
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  startHour: 9,
  endHour: 21,
}

/**
 * 1時間あたりのピクセル数
 */
export const PIXELS_PER_HOUR = 60
