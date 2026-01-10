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
