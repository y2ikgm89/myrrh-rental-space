/**
 * 時間枠生成ロジック - Server-only async関数
 *
 * 指定された日付・スペースの利用可能な時間枠を取得
 * 管理画面・公開ページ両方で使用
 *
 * NOTE: 営業時間設定はDBのSettingsから取得し、複数時間帯に対応
 * NOTE: Client-safe なユーティリティ関数は time-slots-utils.ts に移行
 */

import "server-only";

import {
  getBusinessHoursSettingsQuery,
  getReservationRuleSettings,
  getReservationsForDateQuery,
  getSpaceLocationIdQuery,
  isDateBlocked,
} from "@/shared/domain/reservations/availability";
import type { BusinessHours } from "@/shared/lib/json-validators";
import type { TimeSlot } from "./types";
import {
  getWeekdayKey,
  parseTime,
  generateSlotsFromBusinessHours,
  isMonthlyClosureDate,
} from "./time-slots-utils";

/**
 * DBから営業時間設定を取得
 */
async function getBusinessHoursSettings(): Promise<BusinessHours | null> {
  return getBusinessHoursSettingsQuery();
}

/**
 * 指定された日付・スペースの利用可能な時間枠を取得
 *
 * @param spaceId - スペースID
 * @param date - 日付（YYYY-MM-DD形式）
 * @returns 時間枠の配列
 *
 * @example
 * ```typescript
 * const slots = await getAvailableTimeSlots('space-123', '2024-01-15')
 * // [
 * //   { time: '09:00', available: true },
 * //   { time: '10:00', available: false }, // 予約済み
 * //   ...
 * // ]
 * ```
 */
export async function getAvailableTimeSlots(
  spaceId: string,
  date: string,
): Promise<TimeSlot[]> {
  // 営業時間設定・予約ルール（予約枠の刻み）を取得
  const businessHours = await getBusinessHoursSettings();
  const { defaultTimeSlot } = await getReservationRuleSettings();

  // 営業時間に基づいて時間枠を生成（刻みは設定の予約枠時間単位）
  const slots = generateSlotsFromBusinessHours(
    businessHours,
    date,
    defaultTimeSlot,
  );

  // 定休日（営業時間設定）の場合は空配列をそのまま返す
  if (slots.length === 0) {
    return slots;
  }

  // 臨時休業 / 急な休み（BlockedDate）の 3 階層 cascade チェック。
  // blocked なら全枠予約不可（空配列）にして公開カレンダーで grey-out させる。
  const locationId = await getSpaceLocationIdQuery(spaceId);
  if (locationId !== null) {
    const blocked = await isDateBlocked(spaceId, locationId, date);
    if (blocked.blocked) {
      return [];
    }
  }

  // その日の予約を取得
  const dateStart = new Date(`${date}T00:00:00`);
  const dateEnd = new Date(`${date}T23:59:59`);

  const reservations = await getReservationsForDateQuery(
    spaceId,
    dateStart,
    dateEnd,
  );

  // 予約済みの時間枠を unavailable にマーク
  for (const reservation of reservations) {
    const resStartMinutes =
      reservation.startTime.getHours() * 60 +
      reservation.startTime.getMinutes();
    const resEndMinutes =
      reservation.endTime.getHours() * 60 + reservation.endTime.getMinutes();

    for (const slot of slots) {
      const slotParsed = parseTime(slot.time);
      const slotMinutes = slotParsed.hour * 60 + slotParsed.minute;
      // スロットが予約時間内にある場合は unavailable
      if (slotMinutes >= resStartMinutes && slotMinutes < resEndMinutes) {
        slot.available = false;
      }
    }
  }

  // 今日の場合、過去の時間枠を unavailable にマーク
  // NOTE: タイムゾーンはサーバーのローカル時間を使用（日本時間想定）
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  if (date === today) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    for (const slot of slots) {
      const slotParsed = parseTime(slot.time);
      const slotMinutes = slotParsed.hour * 60 + slotParsed.minute;
      // 現在時刻以前のスロットは予約不可（現在のスロットは予約可能）
      if (slotMinutes < currentMinutes) {
        slot.available = false;
      }
    }
  }

  return slots;
}

/**
 * 営業時間設定を取得（外部公開用）
 *
 * カレンダーコンポーネントなどで営業時間を表示する際に使用
 */
export { getBusinessHoursSettings };
