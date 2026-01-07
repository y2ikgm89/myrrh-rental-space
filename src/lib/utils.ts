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
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
