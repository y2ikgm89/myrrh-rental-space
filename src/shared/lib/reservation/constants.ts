/**
 * 予約関連定数
 *
 * 管理画面・公開ページ両方で使用される営業時間等の定数
 */

/**
 * デフォルトの営業時間
 *
 * @example
 * // 9:00 〜 21:00
 * const hours = DEFAULT_BUSINESS_HOURS
 * console.log(hours.start) // 9
 * console.log(hours.end)   // 21
 */
export const DEFAULT_BUSINESS_HOURS = {
  /** 営業開始時間（時） */
  start: 9,
  /** 営業終了時間（時） */
  end: 21,
} as const

export type BusinessHours = typeof DEFAULT_BUSINESS_HOURS
