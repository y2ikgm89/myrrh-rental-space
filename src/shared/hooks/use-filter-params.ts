/**
 * nuqs ベースのフィルターパラメータhooks
 *
 * @description 管理画面のフィルター機能で共通使用するhooks
 * @see https://nuqs.dev/docs/hooks
 */

'use client'

import { useQueryStates, parseAsString, parseAsInteger } from 'nuqs'
import { useCallback, useRef, useEffect } from 'react'

// ============================================================
// Types
// ============================================================

export type FilterParams = {
  search: string
  status: string
  page: number
  perPage: number
}

export type UseFilterParamsOptions = {
  /** デバウンス時間（ミリ秒） */
  debounceMs?: number
  /** デフォルトのステータス値 */
  defaultStatus?: string
  /** デフォルトの1ページあたりの件数 */
  defaultPerPage?: number
}

// ============================================================
// Hooks
// ============================================================

/**
 * 基本フィルターパラメータhooks
 *
 * @example
 * const { params, setSearch, setStatus, setPage } = useFilterParams()
 */
export function useFilterParams(options: UseFilterParamsOptions = {}) {
  const {
    debounceMs = 300,
    defaultStatus = '',
    defaultPerPage = 10,
  } = options

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [params, setParams] = useQueryStates(
    {
      search: parseAsString.withDefault(''),
      status: parseAsString.withDefault(defaultStatus),
      page: parseAsInteger.withDefault(1),
      perPage: parseAsInteger.withDefault(defaultPerPage),
    },
    {
      history: 'push',
      shallow: false,
    }
  )

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  // 検索（デバウンス付き）
  const setSearchDebounced = useCallback(
    (value: string) => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
      searchTimeoutRef.current = setTimeout(() => {
        void setParams({ search: value || null, page: 1 })
      }, debounceMs)
    },
    [setParams, debounceMs]
  )

  // 即時検索（デバウンスなし）
  const setSearch = useCallback(
    (value: string) => {
      void setParams({ search: value || null, page: 1 })
    },
    [setParams]
  )

  // ステータス変更
  const setStatus = useCallback(
    (value: string) => {
      const statusValue = value === 'ALL' ? null : value || null
      void setParams({ status: statusValue, page: 1 })
    },
    [setParams]
  )

  // ページ変更
  const setPage = useCallback(
    (value: number) => {
      void setParams({ page: value })
    },
    [setParams]
  )

  // 1ページあたりの件数変更
  const setPerPage = useCallback(
    (value: number) => {
      void setParams({ perPage: value, page: 1 })
    },
    [setParams]
  )

  // リセット
  const reset = useCallback(() => {
    void setParams({
      search: null,
      status: null,
      page: 1,
      perPage: defaultPerPage,
    })
  }, [setParams, defaultPerPage])

  return {
    params: {
      ...params,
      status: params.status || 'ALL',
    },
    setSearch,
    setSearchDebounced,
    setStatus,
    setPage,
    setPerPage,
    reset,
  }
}

/**
 * 拡張フィルターパラメータhooks（カテゴリ付き）
 *
 * @example
 * const { params, setCategory } = useFilterParamsWithCategory()
 */
export function useFilterParamsWithCategory(options: UseFilterParamsOptions = {}) {
  const {
    debounceMs = 300,
    defaultStatus = '',
    defaultPerPage = 10,
  } = options

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [params, setParams] = useQueryStates(
    {
      search: parseAsString.withDefault(''),
      status: parseAsString.withDefault(defaultStatus),
      categoryId: parseAsString.withDefault(''),
      page: parseAsInteger.withDefault(1),
      perPage: parseAsInteger.withDefault(defaultPerPage),
    },
    {
      history: 'push',
      shallow: false,
    }
  )

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  // 検索（デバウンス付き）
  const setSearchDebounced = useCallback(
    (value: string) => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
      searchTimeoutRef.current = setTimeout(() => {
        void setParams({ search: value || null, page: 1 })
      }, debounceMs)
    },
    [setParams, debounceMs]
  )

  // 即時検索
  const setSearch = useCallback(
    (value: string) => {
      void setParams({ search: value || null, page: 1 })
    },
    [setParams]
  )

  // ステータス変更
  const setStatus = useCallback(
    (value: string) => {
      const statusValue = value === 'ALL' ? null : value || null
      void setParams({ status: statusValue, page: 1 })
    },
    [setParams]
  )

  // カテゴリ変更
  const setCategory = useCallback(
    (value: string) => {
      const categoryValue = value === 'ALL' ? null : value || null
      void setParams({ categoryId: categoryValue, page: 1 })
    },
    [setParams]
  )

  // ページ変更
  const setPage = useCallback(
    (value: number) => {
      void setParams({ page: value })
    },
    [setParams]
  )

  // リセット
  const reset = useCallback(() => {
    void setParams({
      search: null,
      status: null,
      categoryId: null,
      page: 1,
      perPage: defaultPerPage,
    })
  }, [setParams, defaultPerPage])

  return {
    params: {
      ...params,
      status: params.status || 'ALL',
      categoryId: params.categoryId || 'ALL',
    },
    setSearch,
    setSearchDebounced,
    setStatus,
    setCategory,
    setPage,
    reset,
  }
}
