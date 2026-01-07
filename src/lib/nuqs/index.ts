/**
 * nuqs エクスポート
 *
 * @example Server Component
 * ```tsx
 * import { loadBlogSearchParams } from '@/lib/nuqs'
 *
 * export default async function BlogPage({ searchParams }) {
 *   const { q, page, category } = await loadBlogSearchParams(searchParams)
 *   // ...
 * }
 * ```
 *
 * @example Client Component
 * ```tsx
 * 'use client'
 * import { useQueryState } from 'nuqs'
 * import { parseAsPage } from '@/lib/nuqs'
 *
 * export function Pagination() {
 *   const [page, setPage] = useQueryState('page', parseAsPage)
 *   // ...
 * }
 * ```
 */

// パーサー
export {
  parseAsBoolean,
  parseAsCommaSeparated,
  parseAsDate,
  parseAsPage,
  parseAsPerPage,
  parseAsQuery,
  parseAsSortOrder,
  sortOrders,
  type SortOrder,
} from './parsers'

// SearchParams 定義
export {
  // ブログ
  blogSearchParams,
  blogSearchParamsCache,
  loadBlogSearchParams,
  // お知らせ
  loadNewsSearchParams,
  // スペース
  loadSpaceSearchParams,
  newsSearchParams,
  newsSearchParamsCache,
  spaceSearchParams,
  spaceSearchParamsCache,
} from './search-params'
