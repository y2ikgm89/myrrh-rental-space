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
import {
  formatJstDateString,
  getJstMinutesOfDay,
  parseDateTimeLocalAsJst,
} from "@/shared/lib/date-format";
import type { BusinessHours } from "@/shared/lib/json-validators";
import type { TimeSlot } from "./types";
import { parseTime, generateSlotsFromBusinessHours } from "./time-slots-utils";

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

  // その日の予約を取得。JST カレンダー日の 00:00 / 23:59:59 を SSoT helper で
  // JST 固定 parse する (Codex P1 #1009, comment 3566748512)。サーバ tz (Cloud Run = UTC) で
  // `new Date(`${date}T00:00:00`)` すると server-local (=UTC) parse になり、JST 早朝の
  // 予約 (UTC 前日夜) が窓外に落ちて availability から漏れる silent bug になる。
  const dateStart = parseDateTimeLocalAsJst(`${date}T00:00`);
  const dateEnd = parseDateTimeLocalAsJst(`${date}T23:59:59`);

  const reservations = await getReservationsForDateQuery(
    spaceId,
    dateStart,
    dateEnd,
  );

  // 予約済みの時間枠を unavailable にマーク。
  // 予約 datetime は UTC 保存だが、スロットラベル (BusinessHours 設定) は
  // JST wall-clock。Cloud Run (UTC) で `.getHours()` を使うと 9 時間ずれる
  // ため JST 固定の `getJstMinutesOfDay` SSoT で照合する。
  for (const reservation of reservations) {
    const resStartMinutes = getJstMinutesOfDay(reservation.startTime);
    const resEndMinutes = getJstMinutesOfDay(reservation.endTime);

    for (const slot of slots) {
      const slotParsed = parseTime(slot.time);
      const slotMinutes = slotParsed.hour * 60 + slotParsed.minute;
      // スロットが予約時間内にある場合は unavailable
      if (slotMinutes >= resStartMinutes && slotMinutes < resEndMinutes) {
        slot.available = false;
      }
    }
  }

  // 今日の場合、過去の時間枠を unavailable にマーク。
  // Cloud Run (UTC) では `now.getFullYear() / getHours()` が UTC 値を返すため、
  // JST 早朝は前日として扱われる silent bug が発生する。JST 固定 SSoT で判定する。
  const now = new Date();
  const today = formatJstDateString(now);

  if (date === today) {
    const currentMinutes = getJstMinutesOfDay(now);
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
