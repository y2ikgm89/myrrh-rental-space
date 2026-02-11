/**
 * 管理画面用プレビューフック
 *
 * エディタからプレビュー機能を使用するためのユーティリティ
 */

import {
  type PostPreviewData,
  type NewsPreviewData,
  type PagePreviewData,
  type PreviewData,
  getPreviewStorageKey,
} from '@/shared/types'

// =============================================================================
// Types
// =============================================================================

type ContentType = 'post' | 'news' | 'page'

type PreviewDataMap = {
  post: PostPreviewData
  news: NewsPreviewData
  page: PagePreviewData
}

/** 任意のプレビューデータ型（統一エディター用） */
type AnyPreviewData = PostPreviewData | NewsPreviewData | PagePreviewData

// =============================================================================
// Storage Functions
// =============================================================================

/**
 * プレビューデータをセッションストレージに保存
 *
 * @param contentType - コンテンツタイプ
 * @param identifier - スラッグまたは識別子（新規作成時は 'new'）
 * @param data - プレビューデータ
 */
export function savePreviewData<T extends ContentType>(
  contentType: T,
  identifier: string,
  data: PreviewDataMap[T]
): void {
  const key = getPreviewStorageKey(contentType, identifier)
  const container: PreviewData<PreviewDataMap[T]> = {
    version: 1,
    timestamp: Date.now(),
    contentType,
    data,
  }

  try {
    sessionStorage.setItem(key, JSON.stringify(container))
  } catch (error) {
    // sessionStorageが使用できない場合（プライベートブラウジング等）
    console.warn('Failed to save preview data:', error)
  }
}

/**
 * プレビューページを新しいタブで開く
 *
 * @param contentType - コンテンツタイプ
 * @param identifier - スラッグまたは識別子
 * @param basePath - プレビューページのベースパス（例: '/posts'）
 */
export function openPreview(
  contentType: ContentType,
  identifier: string,
  basePath: string
): void {
  const previewSlug = identifier || 'preview-new'
  const url = `${basePath}/${previewSlug}?preview=true`
  window.open(url, '_blank')
}

/**
 * プレビューデータをクリア
 *
 * @param contentType - コンテンツタイプ
 * @param identifier - スラッグまたは識別子
 */
export function clearPreviewData(
  contentType: ContentType,
  identifier: string
): void {
  const key = getPreviewStorageKey(contentType, identifier)
  try {
    sessionStorage.removeItem(key)
  } catch (error) {
    console.warn('Failed to clear preview data:', error)
  }
}

// =============================================================================
// React Hook
// =============================================================================

/**
 * プレビュー機能を使用するためのフック
 *
 * @param contentType - コンテンツタイプ
 * @returns プレビュー関連の関数
 *
 * @example
 * ```tsx
 * const { saveAndOpenPreview } = usePreview('post')
 *
 * const handlePreview = () => {
 *   const values = getValues()
 *   saveAndOpenPreview(values.slug || 'new', {
 *     title: values.title,
 *     slug: values.slug,
 *     // ...
 *   })
 * }
 * ```
 */
export function usePreview<T extends ContentType>(contentType: T) {
  const save = (identifier: string, data: PreviewDataMap[T] | AnyPreviewData) => {
    // 外部ライブラリ型要件: PreviewDataMapの型はcontentTypeに依存するが、
    // 統一エディターから呼ばれる場合はAnyPreviewData型で渡される
    savePreviewData(contentType, identifier, data as PreviewDataMap[T])
  }

  const open = (identifier: string, basePath: string) => {
    openPreview(contentType, identifier, basePath)
  }

  const clear = (identifier: string) => {
    clearPreviewData(contentType, identifier)
  }

  const saveAndOpenPreview = (identifier: string, data: PreviewDataMap[T] | AnyPreviewData, basePath: string) => {
    save(identifier, data)
    open(identifier, basePath)
  }

  return {
    savePreviewData: save,
    openPreview: open,
    clearPreviewData: clear,
    saveAndOpenPreview,
  }
}
