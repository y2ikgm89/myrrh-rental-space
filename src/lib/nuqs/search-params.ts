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

// ============================================================
// 管理画面: ユーザー一覧
// ============================================================

export const adminUserSearchParams = {
  /** ページ番号 */
  page: parseAsPage,
  /** 1ページあたりの件数 */
  perPage: parseAsPerPage.withDefault(20),
  /** 検索キーワード */
  search: parseAsQuery,
  /** ロールフィルター */
  role: parseAsQuery.withDefault('ALL'),
  /** ソートキー */
  sortBy: parseAsQuery.withDefault('createdAt'),
  /** ソート順 */
  sortOrder: parseAsSortOrder,
}

/** 管理画面ユーザー一覧の Server Component 用ローダー */
export const loadAdminUserSearchParams = createLoader(adminUserSearchParams)

/** 管理画面ユーザー一覧の SearchParams キャッシュ */
export const adminUserSearchParamsCache = createSearchParamsCache(adminUserSearchParams)

// ============================================================
// 管理画面: 監査ログ
// ============================================================

export const adminAuditLogSearchParams = {
  /** ページ番号 */
  page: parseAsPage,
  /** 1ページあたりの件数 */
  perPage: parseAsPerPage.withDefault(50),
  /** アクションフィルター */
  action: parseAsQuery.withDefault('ALL'),
  /** リソースフィルター */
  resource: parseAsQuery,
  /** ユーザーIDフィルター */
  userId: parseAsQuery,
  /** 開始日フィルター */
  dateFrom: parseAsQuery,
  /** 終了日フィルター */
  dateTo: parseAsQuery,
}

/** 管理画面監査ログの Server Component 用ローダー */
export const loadAdminAuditLogSearchParams = createLoader(adminAuditLogSearchParams)

/** 管理画面監査ログの SearchParams キャッシュ */
export const adminAuditLogSearchParamsCache = createSearchParamsCache(adminAuditLogSearchParams)
