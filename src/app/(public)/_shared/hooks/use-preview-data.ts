'use client'

/**
 * 公開ページ用プレビューデータフック
 *
 * セッションストレージからプレビューデータを読み取るためのフック
 * useSyncExternalStore を使用して hydration ミスマッチを防ぐ
 *
 * @see https://react.dev/reference/react/useSyncExternalStore
 */

import { useSyncExternalStore, useCallback, useMemo } from 'react'
import {
  type PostPreviewData,
  type NewsPreviewData,
  type PagePreviewData,
  type PreviewData,
  getPreviewStorageKey,
  isPreviewDataValid,
  PostPreviewContainerSchema,
  NewsPreviewContainerSchema,
  PagePreviewContainerSchema,
} from '@/shared/types'
import type { z } from 'zod'

// =============================================================================
// Types
// =============================================================================

type ContentType = 'post' | 'news' | 'page'

type PreviewDataMap = {
  post: PostPreviewData
  news: NewsPreviewData
  page: PagePreviewData
}

/**
 * コンテンツタイプ別のZodスキーママップ
 */
const PREVIEW_SCHEMA_MAP = {
  post: PostPreviewContainerSchema,
  news: NewsPreviewContainerSchema,
  page: PagePreviewContainerSchema,
} as const satisfies Record<ContentType, z.ZodTypeAny>

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
// Snapshot Cache
// =============================================================================

/**
 * スナップショットキャッシュ
 *
 * useSyncExternalStore の getSnapshot は毎回同じ参照を返す必要がある
 * （内容が変わらない限り）。新しいオブジェクトを返すと
 * React が変更と認識して無限ループになる。
 *
 * @see https://react.dev/reference/react/useSyncExternalStore#im-getting-an-error-the-result-of-getsnapshot-should-be-cached
 */
type CacheEntry<T> = {
  /** sessionStorage の生の値（比較用） */
  rawValue: string | null
  /** パース済みの結果 */
  result: PreviewData<T> | null
}

const snapshotCache = new Map<string, CacheEntry<unknown>>()

/**
 * サーバーサイド用のスナップショット（常に null）
 */
function getServerSnapshot(): null {
  return null
}

// =============================================================================
// Hook
// =============================================================================

/**
 * プレビューデータを取得するフック
 *
 * @param contentType - コンテンツタイプ（post, news, page）
 * @param identifier - スラッグまたは識別子
 * @returns プレビューデータと関連関数
 *
 * @example
 * ```tsx
 * const { data, error, isPreview, clearData } = usePreviewData('post', slug)
 *
 * if (isPreview && data) {
 *   return <PostPreviewContent data={data} />
 * }
 * ```
 */
export function usePreviewData<T extends ContentType>(
  contentType: T,
  identifier: string
): UsePreviewDataResult<PreviewDataMap[T]> {
  const key = getPreviewStorageKey(contentType, identifier)

  /**
   * subscribe 関数を useMemo でメモ化
   * key が変わらない限り同じ関数参照を維持
   */
  const subscribe = useMemo(() => {
    return (callback: () => void): (() => void) => {
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
  }, [key])

  /**
   * セッションストレージからスナップショットを取得
   *
   * 重要: 同じ内容なら同じ参照を返す必要がある
   */
  const getSnapshot = useCallback((): PreviewData<PreviewDataMap[T]> | null => {
    if (typeof window === 'undefined') {
      return null
    }

    try {
      const stored = sessionStorage.getItem(key)

      // キャッシュを確認（同じ生の値なら同じ結果を返す）
      const cached = snapshotCache.get(key)
      if (cached !== undefined && cached.rawValue === stored) {
        return cached.result as PreviewData<PreviewDataMap[T]> | null
      }

      // データが存在しない場合
      if (!stored) {
        const nullEntry: CacheEntry<PreviewDataMap[T]> = {
          rawValue: null,
          result: null,
        }
        snapshotCache.set(key, nullEntry)
        return null
      }

      // Zodスキーマでバリデーション（型アサーションを排除）
      const jsonData: unknown = JSON.parse(stored)
      const schema = PREVIEW_SCHEMA_MAP[contentType]
      const parseResult = schema.safeParse(jsonData)

      if (!parseResult.success) {
        // バリデーション失敗（バージョン不一致、コンテンツタイプ不一致含む）
        const invalidEntry: CacheEntry<PreviewDataMap[T]> = {
          rawValue: stored,
          result: null,
        }
        snapshotCache.set(key, invalidEntry)
        return null
      }

      const parsed = parseResult.data as PreviewData<PreviewDataMap[T]>

      // 有効期限チェック
      if (!isPreviewDataValid(parsed.timestamp)) {
        // 期限切れデータを削除
        sessionStorage.removeItem(key)
        const expiredEntry: CacheEntry<PreviewDataMap[T]> = {
          rawValue: null,
          result: null,
        }
        snapshotCache.set(key, expiredEntry)
        return null
      }

      // 有効なデータをキャッシュ
      const validEntry: CacheEntry<PreviewDataMap[T]> = {
        rawValue: stored,
        result: parsed,
      }
      snapshotCache.set(key, validEntry)
      return parsed
    } catch {
      // パースエラー時はキャッシュをクリア
      const errorEntry: CacheEntry<PreviewDataMap[T]> = {
        rawValue: null,
        result: null,
      }
      snapshotCache.set(key, errorEntry)
      return null
    }
  }, [key, contentType])

  // useSyncExternalStore で hydration 安全に状態を取得
  const container = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  )

  // データをクリアする関数
  const clearData = useCallback(() => {
    try {
      sessionStorage.removeItem(key)
      // キャッシュもクリア
      snapshotCache.delete(key)
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
