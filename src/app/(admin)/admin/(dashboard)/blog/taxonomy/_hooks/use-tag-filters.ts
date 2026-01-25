'use client'

/**
 * タグフィルター・ソート用hooks
 *
 * @description nuqs を使用した型安全な URL パラメータ管理
 */

import { useQueryStates, parseAsString, parseAsBoolean } from 'nuqs'
import { useRef, useEffect } from 'react'

// =============================================================================
// Types
// =============================================================================

export type TagSortField = 'name' | 'postCount' | 'createdAt'
export type SortOrder = 'asc' | 'desc'

export type TagFilterParams = {
  search: string
  sortBy: TagSortField
  sortOrder: SortOrder
  unusedOnly: boolean
}

// =============================================================================
// Debounce Hook
// =============================================================================

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

  return (value: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => {
      callback(value)
    }, delayMs)
  }
}

// =============================================================================
// Hook
// =============================================================================

export function useTagFilters() {
  const [params, setParams] = useQueryStates(
    {
      search: parseAsString.withDefault(''),
      sortBy: parseAsString.withDefault('name'),
      sortOrder: parseAsString.withDefault('asc'),
      unusedOnly: parseAsBoolean.withDefault(false),
    },
    {
      history: 'push',
      shallow: false,
    }
  )

  // 検索（即時）
  const setSearch = (value: string) => {
    void setParams({ search: value || null })
  }

  // 検索（デバウンス付き）
  const setSearchDebounced = useDebouncedCallback(setSearch, 300)

  // ソートフィールド変更
  const setSortBy = (value: TagSortField) => {
    void setParams({ sortBy: value })
  }

  // ソート順変更
  const setSortOrder = (value: SortOrder) => {
    void setParams({ sortOrder: value })
  }

  // ソートトグル（同じフィールドクリックで順序反転）
  const toggleSort = (field: TagSortField) => {
    if (params.sortBy === field) {
      void setParams({ sortOrder: params.sortOrder === 'asc' ? 'desc' : 'asc' })
    } else {
      void setParams({ sortBy: field, sortOrder: 'asc' })
    }
  }

  // 未使用のみフィルター
  const setUnusedOnly = (value: boolean) => {
    void setParams({ unusedOnly: value || null })
  }

  // リセット
  const reset = () => {
    void setParams({
      search: null,
      sortBy: null,
      sortOrder: null,
      unusedOnly: null,
    })
  }

  return {
    params: {
      search: params.search,
      sortBy: params.sortBy as TagSortField,
      sortOrder: params.sortOrder as SortOrder,
      unusedOnly: params.unusedOnly,
    },
    setSearch,
    setSearchDebounced,
    setSortBy,
    setSortOrder,
    toggleSort,
    setUnusedOnly,
    reset,
  }
}
