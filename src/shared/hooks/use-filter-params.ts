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

export type FilterParamsWithCategory = FilterParams & {
  categoryId: string
}

export type UseFilterParamsOptions = {
  /** デバウンス時間（ミリ秒） */
  debounceMs?: number
  /** デフォルトのステータス値 */
  defaultStatus?: string
  /** デフォルトの1ページあたりの件数 */
  defaultPerPage?: number
  /** カテゴリフィルターを含めるか */
  withCategory?: boolean
}

// ============================================================
// Internal: Debounce Hook
// ============================================================

function useDebouncedCallback(
  callback: (value: string) => void,
  delayMs: number
): (value: string) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return useCallback(
    (value: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => {
        callback(value)
      }, delayMs)
    },
    [callback, delayMs]
  )
}

// ============================================================
// Return Types
// ============================================================

type BaseFilterReturn = {
  params: FilterParams
  setSearch: (value: string) => void
  setSearchDebounced: (value: string) => void
  setStatus: (value: string) => void
  setPage: (value: number) => void
  setPerPage: (value: number) => void
  reset: () => void
}

type CategoryFilterReturn = {
  params: FilterParamsWithCategory
  setSearch: (value: string) => void
  setSearchDebounced: (value: string) => void
  setStatus: (value: string) => void
  setCategory: (value: string) => void
  setPage: (value: number) => void
  setPerPage: (value: number) => void
  reset: () => void
}

// ============================================================
// Hooks
// ============================================================

/**
 * 基本フィルターパラメータhooks
 *
 * @example
 * const { params, setSearch, setStatus, setPage } = useFilterParams()
 * const { params, setCategory } = useFilterParams({ withCategory: true })
 */
export function useFilterParams(
  options: UseFilterParamsOptions & { withCategory: true }
): CategoryFilterReturn
export function useFilterParams(
  options?: UseFilterParamsOptions & { withCategory?: false }
): BaseFilterReturn
export function useFilterParams(
  options: UseFilterParamsOptions = {}
): BaseFilterReturn | CategoryFilterReturn {
  const {
    debounceMs = 300,
    defaultStatus = '',
    defaultPerPage = 10,
    withCategory = false,
  } = options

  // パーサー定義
  const baseParsers = {
    search: parseAsString.withDefault(''),
    status: parseAsString.withDefault(defaultStatus),
    page: parseAsInteger.withDefault(1),
    perPage: parseAsInteger.withDefault(defaultPerPage),
  }

  const parsers = withCategory
    ? { ...baseParsers, categoryId: parseAsString.withDefault('') }
    : baseParsers

  const [params, setParams] = useQueryStates(parsers, {
    history: 'push',
    shallow: false,
  })

  // 即時検索
  const setSearch = useCallback(
    (value: string) => {
      void setParams({ search: value || null, page: 1 })
    },
    [setParams]
  )

  // 検索（デバウンス付き）
  const setSearchDebounced = useDebouncedCallback(setSearch, debounceMs)

  // ステータス変更
  const setStatus = useCallback(
    (value: string) => {
      const statusValue = value === 'ALL' ? null : value || null
      void setParams({ status: statusValue, page: 1 })
    },
    [setParams]
  )

  // カテゴリ変更（withCategory=trueの場合のみ）
  const setCategory = useCallback(
    (value: string) => {
      if (!withCategory) return
      const categoryValue = value === 'ALL' ? null : value || null
      void setParams({ categoryId: categoryValue, page: 1 } as typeof params)
    },
    [setParams, withCategory]
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
      ...(withCategory ? { categoryId: null } : {}),
    } as Parameters<typeof setParams>[0])
  }, [setParams, defaultPerPage, withCategory])

  // 戻り値を構築
  const base = {
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

  if (withCategory) {
    const categoryParams = params as { categoryId?: string }
    return {
      ...base,
      params: {
        ...base.params,
        categoryId: categoryParams.categoryId || 'ALL',
      } as FilterParamsWithCategory,
      setCategory,
    }
  }

  return base as {
    params: FilterParams
    setSearch: (value: string) => void
    setSearchDebounced: (value: string) => void
    setStatus: (value: string) => void
    setPage: (value: number) => void
    setPerPage: (value: number) => void
    reset: () => void
  }
}

/**
 * カテゴリ付きフィルターパラメータhooks（後方互換用）
 *
 * @example
 * const { params, setCategory } = useFilterParamsWithCategory()
 */
export function useFilterParamsWithCategory(
  options: Omit<UseFilterParamsOptions, 'withCategory'> = {}
) {
  return useFilterParams({ ...options, withCategory: true })
}
