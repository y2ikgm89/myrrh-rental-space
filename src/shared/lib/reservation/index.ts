/**
 * 予約関連共有ロジック - バレルエクスポート
 *
 * 管理画面・公開ページ両方で使用される予約ロジック
 *
 * @example
 * ```typescript
 * import {
 *   DEFAULT_BUSINESS_HOURS,
 *   checkReservationOverlap,
 *   getAvailableTimeSlots,
 *   type TimeSlot,
 * } from '@/shared/lib/reservation'
 * ```
 */

// Constants
export { DEFAULT_BUSINESS_HOURS, type BusinessHours } from "./constants";

// Types
export type {
  TimeSlot,
  CalendarDate,
  OverlapCheckParams,
  OverlapCheckResult,
  PrismaTransactionClient,
} from "./types";

// Functions
export { checkReservationOverlap } from "./overlap-check";
export {
  getAvailableTimeSlots,
  getAvailableDatesInMonth,
  isBusinessDay,
  getBusinessHoursSettings,
} from "./time-slots";

// Client-safe utilities
export {
  getWeekdayKey,
  parseTime,
  generateSlotsFromBusinessHours,
  generateFallbackSlots,
} from "./time-slots-utils";
