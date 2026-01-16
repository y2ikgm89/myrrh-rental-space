/**
 * nuqs カスタムパーサー
 *
 * @description 型安全な URL パラメータパーサーを提供
 * @see https://nuqs.dev/docs/parsers
 */

import {
  createParser,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server'

// ============================================================
// ページネーション
// ============================================================

/** ページ番号（1始まり、デフォルト: 1） */
export const parseAsPage = parseAsInteger.withDefault(1)

/** 1ページあたりの件数（デフォルト: 10） */
export const parseAsPerPage = parseAsInteger.withDefault(10)

// ============================================================
// ソート
// ============================================================

/** ソート順 */
export type SortOrder = 'asc' | 'desc'
export const sortOrders: readonly SortOrder[] = ['asc', 'desc']

export const parseAsSortOrder = parseAsStringLiteral(sortOrders).withDefault(
  'desc'
)

// ============================================================
// フィルター（汎用）
// ============================================================

/** 検索クエリ（デフォルト: 空文字列） */
export const parseAsQuery = parseAsString.withDefault('')

/** カンマ区切りの配列 */
export const parseAsCommaSeparated = parseAsArrayOf(parseAsString, ',')

// ============================================================
// 日付
// ============================================================

/** ISO 日付文字列をパース */
export const parseAsDate = createParser<Date>({
  parse: (value) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  },
  serialize: (date) => date.toISOString().split('T')[0],
  eq: (a, b) => a.getTime() === b.getTime(),
})

// ============================================================
// ブール値
// ============================================================

/** 文字列ブール値（'true'/'false'） */
export const parseAsBoolean = createParser<boolean>({
  parse: (value) => {
    if (value === 'true') return true
    if (value === 'false') return false
    return null
  },
  serialize: (value) => (value ? 'true' : 'false'),
})
