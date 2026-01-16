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

/**
 * 公開日時を決定するヘルパー関数
 *
 * @param inputDate - ユーザーが指定した公開日時（文字列）
 * @param isPublished - 公開フラグ
 * @param existingDate - 既存の公開日時（更新時）
 * @returns 決定された公開日時
 *
 * ロジック:
 * 1. inputDateが指定されている → その日時を使用
 * 2. 公開フラグON + 既存日時なし → 現在日時を使用
 * 3. それ以外 → 既存日時を維持（またはnull）
 */
export function determinePublishedAt(
  inputDate: string | null | undefined,
  isPublished: boolean,
  existingDate?: Date | null
): Date | null {
  if (inputDate) return new Date(inputDate)
  if (isPublished && !existingDate) return new Date()
  return existingDate ?? null
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
 * 変化率のフォーマット（+/-記号付き）
 *
 * @example
 * formatChange(15)  // → '+15%'
 * formatChange(-5)  // → '-5%'
 * formatChange(0)   // → '0%'
 */
export function formatChange(change: number): string {
  if (change > 0) return `+${change}%`
  if (change < 0) return `${change}%`
  return '0%'
}

/**
 * 変化率に応じた色クラスを取得
 *
 * @example
 * getChangeColor(15)  // → 'text-green-600'
 * getChangeColor(-5)  // → 'text-red-600'
 * getChangeColor(0)   // → 'text-muted-foreground'
 */
export function getChangeColor(change: number): string {
  if (change > 0) return 'text-green-600'
  if (change < 0) return 'text-red-600'
  return 'text-muted-foreground'
}

/**
 * バイト数を人間が読みやすい形式にフォーマット
 *
 * @example
 * formatBytes(1024)      // → '1 KB'
 * formatBytes(1048576)   // → '1 MB'
 * formatBytes(500)       // → '500 B'
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`
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
