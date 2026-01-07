/**
 * 機能別 SearchParams 定義
 *
 * @description Server/Client で共有する検索パラメータスキーマ
 * @see https://nuqs.dev/docs/server-side
 */

import { createLoader, createSearchParamsCache } from 'nuqs/server'

import {
  parseAsCommaSeparated,
  parseAsPage,
  parseAsPerPage,
  parseAsQuery,
  parseAsSortOrder,
} from './parsers'

// ============================================================
// ブログ一覧
// ============================================================

export const blogSearchParams = {
  /** 検索キーワード */
  q: parseAsQuery,
  /** ページ番号 */
  page: parseAsPage,
  /** 1ページあたりの件数 */
  perPage: parseAsPerPage,
  /** カテゴリスラッグ */
  category: parseAsQuery,
  /** タグスラッグ（カンマ区切り） */
  tags: parseAsCommaSeparated,
  /** ソート順 */
  sort: parseAsSortOrder,
}

/** ブログ一覧の Server Component 用ローダー */
export const loadBlogSearchParams = createLoader(blogSearchParams)

/** ブログ一覧の SearchParams キャッシュ（ネストコンポーネント用） */
export const blogSearchParamsCache = createSearchParamsCache(blogSearchParams)

// ============================================================
// スペース一覧
// ============================================================

export const spaceSearchParams = {
  /** 検索キーワード */
  q: parseAsQuery,
  /** ページ番号 */
  page: parseAsPage,
  /** 1ページあたりの件数 */
  perPage: parseAsPerPage,
  /** ソート順 */
  sort: parseAsSortOrder,
}

/** スペース一覧の Server Component 用ローダー */
export const loadSpaceSearchParams = createLoader(spaceSearchParams)

/** スペース一覧の SearchParams キャッシュ（ネストコンポーネント用） */
export const spaceSearchParamsCache = createSearchParamsCache(spaceSearchParams)

// ============================================================
// お知らせ一覧
// ============================================================

export const newsSearchParams = {
  /** ページ番号 */
  page: parseAsPage,
  /** 1ページあたりの件数 */
  perPage: parseAsPerPage,
}

/** お知らせ一覧の Server Component 用ローダー */
export const loadNewsSearchParams = createLoader(newsSearchParams)

/** お知らせ一覧の SearchParams キャッシュ */
export const newsSearchParamsCache = createSearchParamsCache(newsSearchParams)
