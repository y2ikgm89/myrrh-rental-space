'use client'

/**
 * 公開ページ用プレビューデータフック
 *
 * セッションストレージからプレビューデータを読み取るためのフック
 * useSyncExternalStore を使用して hydration ミスマッチを防ぐ
 */

import { useSyncExternalStore, useCallback } from 'react'
import {
  type BlogPreviewData,
  type NewsPreviewData,
  type PagePreviewData,
  type PreviewData,
  getPreviewStorageKey,
  isPreviewDataValid,
} from '@/shared/types'

// =============================================================================
// Types
// =============================================================================

type ContentType = 'blog' | 'news' | 'page'

type PreviewDataMap = {
  blog: BlogPreviewData
  news: NewsPreviewData
  page: PagePreviewData
}

type UsePreviewDataResult<T> = {
  /** プレビューデータ（存在しない or 期限切れの場合は null） */
  data: T | null
  /** エラーメッセージ（データ取得失敗時） */
  error: string | null
  /** プレビューモードかどうか */
  isPreview: boolean
  /** プレビューデータをクリア */
  clearData: () => void
}

// =============================================================================
// Storage Subscription
// =============================================================================

/**
 * セッションストレージの変更を監視するためのサブスクリプション
 *
 * useSyncExternalStore 用
 */
function createStorageSubscription(key: string) {
  return function subscribe(callback: () => void): () => void {
    // storage イベントは他タブからの変更のみを検知
    // 同一タブ内の変更は検知しないが、プレビュー機能では
    // 別タブで開くため問題ない
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === key || event.key === null) {
        callback()
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }
}

/**
 * サーバーサイド用のスナップショット（常に null）
 */
function getServerSnapshot<T>(): PreviewData<T> | null {
  return null
}

// =============================================================================
// Hook
// =============================================================================

/**
 * プレビューデータを取得するフック
 *
 * @param contentType - コンテンツタイプ（blog, news, page）
 * @param identifier - スラッグまたは識別子
 * @returns プレビューデータと関連関数
 *
 * @example
 * ```tsx
 * const { data, error, isPreview, clearData } = usePreviewData('blog', slug)
 *
 * if (isPreview && data) {
 *   return <BlogPreviewContent data={data} />
 * }
 * ```
 */
export function usePreviewData<T extends ContentType>(
  contentType: T,
  identifier: string
): UsePreviewDataResult<PreviewDataMap[T]> {
  const key = getPreviewStorageKey(contentType, identifier)

  // セッションストレージからスナップショットを取得
  const getSnapshot = useCallback((): PreviewData<PreviewDataMap[T]> | null => {
    if (typeof window === 'undefined') {
      return null
    }

    try {
      const stored = sessionStorage.getItem(key)
      if (!stored) {
        return null
      }

      const parsed = JSON.parse(stored) as PreviewData<PreviewDataMap[T]>

      // バージョンチェック
      if (parsed.version !== 1) {
        return null
      }

      // コンテンツタイプチェック
      if (parsed.contentType !== contentType) {
        return null
      }

      // 有効期限チェック
      if (!isPreviewDataValid(parsed.timestamp)) {
        // 期限切れデータを削除
        sessionStorage.removeItem(key)
        return null
      }

      return parsed
    } catch {
      return null
    }
  }, [key, contentType])

  // useSyncExternalStore で hydration 安全に状態を取得
  const container = useSyncExternalStore(
    createStorageSubscription(key),
    getSnapshot,
    getServerSnapshot<PreviewDataMap[T]>
  )

  // データをクリアする関数
  const clearData = useCallback(() => {
    try {
      sessionStorage.removeItem(key)
    } catch {
      // ignore
    }
  }, [key])

  // 結果を構築
  if (!container) {
    return {
      data: null,
      error: null,
      isPreview: false,
      clearData,
    }
  }

  return {
    data: container.data,
    error: null,
    isPreview: true,
    clearData,
  }
}
