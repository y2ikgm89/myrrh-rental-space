/**
 * 時間枠生成ロジック
 *
 * 指定された日付・スペースの利用可能な時間枠を取得
 * 管理画面・公開ページ両方で使用
 *
 * NOTE: 営業時間設定はDBのSettingsから取得し、複数時間帯に対応
 */

import {
  getBusinessHoursSettingsQuery,
  getReservationsForDateQuery,
} from '@/shared/domain/reservations/availability'
import type { BusinessHours } from '@/shared/lib/json-validators'
import { DEFAULT_BUSINESS_HOURS } from './constants'
import type { TimeSlot } from './types'

type WeekdayKey = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday'

const WEEKDAY_KEYS: readonly WeekdayKey[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
]

/**
 * DBから営業時間設定を取得
 */
async function getBusinessHoursSettings(): Promise<BusinessHours | null> {
  return getBusinessHoursSettingsQuery()
}

/**
 * 日付から曜日キーを取得
 */
function getWeekdayKey(date: Date): WeekdayKey {
  return WEEKDAY_KEYS[date.getDay()] ?? 'sunday'
}

/**
 * 時刻文字列を時・分に分解
 */
function parseTime(time: string): { hour: number; minute: number } {
  const parts = time.split(':').map(Number)
  return { hour: parts[0] ?? 0, minute: parts[1] ?? 0 }
}

/**
 * 営業時間設定から時間枠を生成
 *
 * @param businessHours - 営業時間設定
 * @param date - 日付（YYYY-MM-DD形式）
 * @returns 営業時間内の時間枠（1時間刻み）
 */
function generateSlotsFromBusinessHours(
  businessHours: BusinessHours | null,
  date: string
): TimeSlot[] {
  const targetDate = new Date(`${date}T00:00:00`)
  const weekday = getWeekdayKey(targetDate)

  // 営業時間設定がない場合はフォールバック
  if (!businessHours) {
    return generateFallbackSlots()
  }

  const daySettings = businessHours[weekday]

  // 休業日の場合は空配列
  if (!daySettings.isOpen || daySettings.slots.length === 0) {
    return []
  }

  const slots: TimeSlot[] = []

  // 各営業時間帯からスロットを生成
  for (const timeSlot of daySettings.slots) {
    const start = parseTime(timeSlot.openTime)
    const end = parseTime(timeSlot.closeTime)

    // 開始時刻から終了時刻まで1時間刻みでスロットを生成
    for (let hour = start.hour; hour < end.hour; hour++) {
      slots.push({
        time: `${hour.toString().padStart(2, '0')}:00`,
        available: true,
      })
    }
  }

  // 重複を除去してソート
  const uniqueSlots = Array.from(
    new Map(slots.map((s) => [s.time, s])).values()
  ).sort((a, b) => a.time.localeCompare(b.time))

  return uniqueSlots
}

/**
 * フォールバック用スロット生成（営業時間設定がない場合）
 */
function generateFallbackSlots(): TimeSlot[] {
  const slots: TimeSlot[] = []
  for (let hour = DEFAULT_BUSINESS_HOURS.start; hour < DEFAULT_BUSINESS_HOURS.end; hour++) {
    slots.push({
      time: `${hour.toString().padStart(2, '0')}:00`,
      available: true,
    })
  }
  return slots
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
  date: string
): Promise<TimeSlot[]> {
  // 営業時間設定を取得
  const businessHours = await getBusinessHoursSettings()

  // 営業時間に基づいて時間枠を生成
  const slots = generateSlotsFromBusinessHours(businessHours, date)

  // 休業日の場合は空配列をそのまま返す
  if (slots.length === 0) {
    return slots
  }

  // その日の予約を取得
  const dateStart = new Date(`${date}T00:00:00`)
  const dateEnd = new Date(`${date}T23:59:59`)

  const reservations = await getReservationsForDateQuery(spaceId, dateStart, dateEnd)

  // 予約済みの時間枠を unavailable にマーク
  for (const reservation of reservations) {
    const startHour = reservation.startTime.getHours()
    const endHour = reservation.endTime.getHours()

    for (const slot of slots) {
      const slotHour = parseInt(slot.time.split(':')[0] ?? '0', 10)
      // スロットが予約時間内にある場合は unavailable
      if (slotHour >= startHour && slotHour < endHour) {
        slot.available = false
      }
    }
  }

  // 今日の場合、過去の時間枠を unavailable にマーク
  // NOTE: タイムゾーンはサーバーのローカル時間を使用（日本時間想定）
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  if (date === today) {
    const currentHour = now.getHours()
    for (const slot of slots) {
      const slotHour = parseInt(slot.time.split(':')[0] ?? '0', 10)
      // 現在時刻以前のスロットは予約不可（現在のスロットは予約可能）
      if (slotHour < currentHour) {
        slot.available = false
      }
    }
  }

  return slots
}

/**
 * 指定された日付が営業日かどうかを判定
 *
 * @param date - 日付（YYYY-MM-DD形式）
 * @param businessHours - 営業時間設定（事前に取得済みの場合）
 * @returns 営業日ならtrue
 */
export async function isBusinessDay(
  date: string,
  businessHours?: BusinessHours | null
): Promise<boolean> {
  const hours = businessHours ?? await getBusinessHoursSettings()

  // 営業時間設定がない場合は全日営業とみなす
  if (!hours) return true

  const targetDate = new Date(`${date}T00:00:00`)
  const weekday = getWeekdayKey(targetDate)
  const daySettings = hours[weekday]

  return daySettings.isOpen && daySettings.slots.length > 0
}

/**
 * 指定された月の予約可能日を取得
 *
 * @param spaceId - スペースID
 * @param year - 年
 * @param month - 月（1-12）
 * @returns 予約可能日の配列（YYYY-MM-DD形式）
 */
export async function getAvailableDatesInMonth(
  spaceId: string,
  year: number,
  month: number
): Promise<string[]> {
  // 営業時間設定を一度だけ取得
  const businessHours = await getBusinessHoursSettings()

  const availableDates: string[] = []
  const daysInMonth = new Date(year, month, 0).getDate()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day)

    // 過去の日付はスキップ
    if (date < today) continue

    const dateString = date.toISOString().split('T')[0] ?? ''

    // 営業日かどうか判定（DBアクセスなし）
    if (!await isBusinessDay(dateString, businessHours)) continue

    const slots = await getAvailableTimeSlots(spaceId, dateString)

    // 1つでも利用可能な時間枠があれば予約可能
    if (slots.some((slot) => slot.available)) {
      availableDates.push(dateString)
    }
  }

  return availableDates
}

/**
 * 営業時間設定を取得（外部公開用）
 *
 * カレンダーコンポーネントなどで営業時間を表示する際に使用
 */
export { getBusinessHoursSettings }
