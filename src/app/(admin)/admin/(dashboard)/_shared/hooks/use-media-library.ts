'use client'

/**
 * useMediaLibrary
 *
 * メディアライブラリからの取得・検索を管理するフック
 * React 19 use API + Suspense パターンに対応
 */

import { useState, useRef, useEffect, startTransition } from 'react'
import { getMediaList, type GetMediaResult } from '@/admin/actions/media'
import type { MediaFilters, MediaPagination } from '@/admin/types/media-picker'

interface UseMediaLibraryOptions {
  initialFilters?: MediaFilters
  pagination?: MediaPagination
}

interface UseMediaLibraryReturn {
  /** Suspenseで使用するPromise */
  mediaPromise: Promise<GetMediaResult>
  /** 初期ロード中かどうか */
  isInitialLoading: boolean
  /** 現在のフィルター */
  currentFilters: MediaFilters
  /** 現在のページ */
  currentPage: number
  /** メディアを再取得（フィルター/ページ変更） */
  fetchMedia: (filters?: MediaFilters, page?: number) => void
  /** 検索（デバウンス付き） */
  searchMedia: (searchTerm: string) => void
  /** ページ変更 */
  setPage: (page: number) => void
  /** 再取得 */
  refetch: () => void
}

const DEFAULT_PAGINATION: MediaPagination = {
  page: 1,
  limit: 50,
}

const DEFAULT_FILTERS: MediaFilters = {
  type: 'IMAGE',
}

/**
 * メディア取得Promiseを作成
 */
function fetchMediaData(
  filters: MediaFilters,
  page: number,
  limit: number
): Promise<GetMediaResult> {
  return getMediaList(
    {
      type: filters.type,
      usage: filters.usage,
      search: filters.search,
    },
    { page, limit }
  )
}

/**
 * 空の初期結果を返す解決済みPromiseを作成
 * レンダリング中にServer Actionを呼ばないようにするため
 */
function createEmptyPromise(limit: number): Promise<GetMediaResult> {
  return Promise.resolve({
    items: [],
    total: 0,
    page: 1,
    limit,
    totalPages: 0,
    hasMore: false,
  })
}

export function useMediaLibrary(
  options?: UseMediaLibraryOptions
): UseMediaLibraryReturn {
  const initialFilters = options?.initialFilters ?? DEFAULT_FILTERS
  const limit = options?.pagination?.limit ?? DEFAULT_PAGINATION.limit

  // レースコンディション対策用のジェネレーションカウンター
  const generationRef = useRef(0)
  // 初期フェッチが完了したかどうか
  const initialFetchDoneRef = useRef(false)

  // 初期状態は空のPromise（レンダリング中にServer Actionを呼ばない）
  const [mediaPromise, setMediaPromise] = useState<Promise<GetMediaResult>>(
    () => createEmptyPromise(limit)
  )

  const [currentFilters, setCurrentFilters] = useState<MediaFilters>(initialFilters)
  const [currentPage, setCurrentPage] = useState(
    options?.pagination?.page ?? DEFAULT_PAGINATION.page
  )
  const [isInitialLoading, setIsInitialLoading] = useState(true)

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 初期データ取得（マウント後に一度だけ）
  useEffect(() => {
    if (initialFetchDoneRef.current) return
    initialFetchDoneRef.current = true

    const generation = ++generationRef.current
    startTransition(() => {
      const promise = fetchMediaData(initialFilters, 1, limit).then((result) => {
        if (generation !== generationRef.current) {
          throw new Error('STALE_REQUEST')
        }
        setIsInitialLoading(false)
        return result
      }).catch((error: Error) => {
        if (error.message === 'STALE_REQUEST') {
          return createEmptyPromise(limit).then((r) => r)
        }
        setIsInitialLoading(false)
        throw error
      })
      setMediaPromise(promise)
    })
  }, [initialFilters, limit])

  // クリーンアップ: タイムアウトをクリア
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  const fetchMedia = (filters?: MediaFilters, page?: number) => {
    const appliedFilters = filters ?? currentFilters
    const appliedPage = page ?? currentPage

    setCurrentFilters(appliedFilters)
    setCurrentPage(appliedPage)

    // ジェネレーションをインクリメント（古いリクエストを無効化）
    const generation = ++generationRef.current

    // startTransitionでPromise更新（Suspenseのフォールバック表示を制御）
    startTransition(() => {
      // Promiseを即座にセット（古いリクエストのチェックは結果取得後）
      const promise = fetchMediaData(appliedFilters, appliedPage, limit).then(
        (result) => {
          // レースコンディション対策: 古いリクエストの結果は無視
          if (generation !== generationRef.current) {
            throw new Error('STALE_REQUEST')
          }
          return result
        }
      ).catch((error: Error) => {
        // STALE_REQUESTエラーは無視し、前の結果を維持
        if (error.message === 'STALE_REQUEST') {
          return createEmptyPromise(limit).then((r) => r)
        }
        throw error
      })
      setMediaPromise(promise)
    })
  }

  const searchMedia = (searchTerm: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(() => {
      const newFilters = { ...currentFilters, search: searchTerm || undefined }
      fetchMedia(newFilters, 1)
    }, 300)
  }

  const setPage = (page: number) => {
    fetchMedia(currentFilters, page)
  }

  const refetch = () => {
    fetchMedia(currentFilters, currentPage)
  }

  return {
    mediaPromise,
    isInitialLoading,
    currentFilters,
    currentPage,
    fetchMedia,
    searchMedia,
    setPage,
    refetch,
  }
}
