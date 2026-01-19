import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Tailwind CSS クラスをマージするユーティリティ関数
 * - clsx: 条件付きクラス名の結合
 * - twMerge: Tailwind クラスの競合解決
 *
 * @example
 * cn('px-2 py-1', 'px-4') // → 'py-1 px-4'
 * cn('text-red-500', isActive && 'text-blue-500') // → 条件付き
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * HTMLエスケープ（XSS対策）
 *
 * ユーザー入力テキストをHTML内で安全に表示するために使用
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// =============================================================================
// FormData ヘルパー
// =============================================================================

/**
 * FormDataから文字列を型安全に取得
 *
 * @param formData - FormDataオブジェクト
 * @param key - フィールド名
 * @param defaultValue - デフォルト値（省略時は空文字列）
 * @returns 文字列値
 *
 * @example
 * const email = getFormString(formData, 'email')
 * const name = getFormString(formData, 'name', 'Guest')
 */
export function getFormString(formData: FormData, key: string, defaultValue = ''): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value : defaultValue
}

/**
 * FormDataから文字列を取得（null許容）
 *
 * @param formData - FormDataオブジェクト
 * @param key - フィールド名
 * @returns 文字列値またはnull
 *
 * @example
 * const guestName = getFormStringOrNull(formData, 'guestName')
 */
export function getFormStringOrNull(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * FormDataから数値を取得
 *
 * @param formData - FormDataオブジェクト
 * @param key - フィールド名
 * @param defaultValue - デフォルト値
 * @returns 数値（パース失敗時はデフォルト値）
 *
 * @example
 * const page = getFormNumber(formData, 'page', 1)
 */
export function getFormNumber(formData: FormData, key: string, defaultValue: number): number {
  const value = formData.get(key)
  if (typeof value !== 'string') return defaultValue
  const parsed = Number(value)
  return Number.isNaN(parsed) ? defaultValue : parsed
}

/**
 * FormDataから真偽値を取得
 *
 * @param formData - FormDataオブジェクト
 * @param key - フィールド名
 * @returns 真偽値（'true'/'on' → true、それ以外 → false）
 *
 * @example
 * const isPublished = getFormBoolean(formData, 'isPublished')
 */
export function getFormBoolean(formData: FormData, key: string): boolean {
  const value = formData.get(key)
  return value === 'true' || value === 'on'
}

// =============================================================================
// フォーマット関数
// =============================================================================

/**
 * 日本円の通貨フォーマット
 *
 * @example
 * formatCurrency(12345) // → '¥12,345'
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
  }).format(value)
}

/**
 * 価格フォーマット（null/undefined 対応）
 *
 * 公開ページでの価格表示用。値が不明な場合はフォールバック文字列を返す。
 *
 * @example
 * formatPrice(12345)           // → '¥12,345'
 * formatPrice(null)            // → '要問合せ'
 * formatPrice(undefined, '-')  // → '-'
 */
export function formatPrice(
  value: number | null | undefined,
  fallback = '要問合せ'
): string {
  if (value === null || value === undefined) return fallback
  return formatCurrency(value)
}

/**
 * 日付を日本語形式でフォーマット
 *
 * @example
 * formatDate(new Date())           // → '2024年1月15日'
 * formatDate('2024-01-15')         // → '2024年1月15日'
 * formatDate(new Date(), true)     // → '2024年1月15日 14:30'
 */
export function formatDate(
  date: Date | string | null | undefined,
  includeTime = false
): string {
  if (!date) return ''

  const d = typeof date === 'string' ? new Date(date) : date

  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }

  if (includeTime) {
    options.hour = '2-digit'
    options.minute = '2-digit'
  }

  return d.toLocaleDateString('ja-JP', options)
}

/**
 * 日付を短縮形式でフォーマット（管理画面用）
 *
 * @example
 * formatDateShort(new Date())      // → '2024/01/15'
 * formatDateShort('2024-01-15')    // → '2024/01/15'
 */
export function formatDateShort(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/**
 * 日時を短縮形式でフォーマット（管理画面用）
 *
 * @example
 * formatDateTimeShort(new Date())  // → '2024/01/15 14:30'
 */
export function formatDateTimeShort(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

/**
 * 日時を詳細形式でフォーマット（曜日付き、管理画面用）
 *
 * @example
 * formatDateTimeFull(new Date())   // → '2024/01/15(月) 14:30'
 */
export function formatDateTimeFull(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}
