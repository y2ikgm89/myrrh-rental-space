/**
 * プレビュー機能用型定義
 *
 * エディタで編集中のコンテンツを保存前にプレビューするための型定義
 */

// =============================================================================
// Preview Data Types
// =============================================================================

/**
 * ブログプレビューデータ
 */
export type BlogPreviewData = {
  title: string
  slug: string
  excerpt: string
  content: string
  thumbnailUrl: string
  publishedAt: string | null
  tags: string[]
  category: {
    name: string
    slug: string
  }
}

/**
 * ニュースプレビューデータ
 */
export type NewsPreviewData = {
  title: string
  slug: string
  content: string
  publishedAt: string | null
}

/**
 * ページプレビューデータ
 */
export type PagePreviewData = {
  title: string
  slug: string
  description: string | null
  content: string
  showSidebar: boolean
}

// =============================================================================
// Preview Container Type
// =============================================================================

/**
 * プレビューデータコンテナ
 *
 * セッションストレージに保存される形式
 */
export type PreviewData<T> = {
  /** バージョン（将来の互換性のため） */
  version: 1
  /** 保存時刻（ミリ秒） */
  timestamp: number
  /** コンテンツタイプ */
  contentType: 'blog' | 'news' | 'page'
  /** 実際のプレビューデータ */
  data: T
}

// =============================================================================
// Constants
// =============================================================================

/** プレビューデータの有効期限（30分） */
export const PREVIEW_EXPIRY_MS = 30 * 60 * 1000

/** プレビュー用セッションストレージキーのプレフィックス */
export const PREVIEW_STORAGE_PREFIX = 'preview-'

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * プレビュー用ストレージキーを生成
 *
 * @param contentType - コンテンツタイプ
 * @param identifier - スラッグまたは識別子
 * @returns ストレージキー
 */
export function getPreviewStorageKey(
  contentType: 'blog' | 'news' | 'page',
  identifier: string
): string {
  return `${PREVIEW_STORAGE_PREFIX}${contentType}-${identifier}`
}

/**
 * プレビューデータが有効期限内かチェック
 *
 * @param timestamp - データの保存時刻
 * @returns 有効期限内の場合 true
 */
export function isPreviewDataValid(timestamp: number): boolean {
  return Date.now() - timestamp < PREVIEW_EXPIRY_MS
}
