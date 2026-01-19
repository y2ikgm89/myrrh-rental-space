/**
 * JSONフィールド用の型定義
 *
 * PrismaのJSON型フィールドに対する具体的な型を提供
 *
 * NOTE: このファイルはクライアントコンポーネントからもインポートされるため、
 * Prisma関連のインポートは含めない（server-onlyモジュールを避けるため）
 */

// =============================================================================
// BusinessHours 型
// =============================================================================

/**
 * 営業時間スロット
 */
export interface TimeSlot {
  /** 開店時刻 "09:00" 形式 */
  open: string
  /** 閉店時刻 "18:00" 形式 */
  close: string
}

/**
 * 曜日キー
 */
export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

/**
 * 曜日一覧（イテレーション用）
 */
export const DAYS_OF_WEEK: readonly DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

/**
 * 曜日Set（O(1) lookup用）
 */
const DAYS_OF_WEEK_SET = new Set<string>(DAYS_OF_WEEK)

/**
 * 曜日別営業時間
 * nullは定休日を表す
 */
export type BusinessHours = {
  [K in DayOfWeek]: TimeSlot | null
}

// =============================================================================
// 型ガード関数
// =============================================================================

/**
 * TimeSlot型であるか判定
 */
function isTimeSlot(value: unknown): value is TimeSlot {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.open === 'string' &&
    typeof obj.close === 'string' &&
    /^\d{2}:\d{2}$/.test(obj.open) &&
    /^\d{2}:\d{2}$/.test(obj.close)
  )
}

/**
 * DayOfWeek型であるか判定
 */
function isDayOfWeek(value: unknown): value is DayOfWeek {
  return typeof value === 'string' && DAYS_OF_WEEK_SET.has(value)
}

/**
 * BusinessHours型であるか判定
 */
export function isBusinessHours(value: unknown): value is BusinessHours {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>

  for (const day of DAYS_OF_WEEK) {
    const slot = obj[day]
    if (slot !== null && !isTimeSlot(slot)) {
      return false
    }
  }

  // 少なくとも1つの曜日キーが存在するか確認
  const keys = Object.keys(obj)
  return keys.some((key) => isDayOfWeek(key))
}

/**
 * unknownからBusinessHoursをパースする
 * 無効な値の場合はnullを返す
 */
export function parseBusinessHours(value: unknown): BusinessHours | null {
  if (value === null || value === undefined) return null
  if (!isBusinessHours(value)) return null
  return value
}
