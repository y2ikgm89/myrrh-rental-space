/**
 * Media Picker Types
 *
 * メディアピッカー機能の型定義
 */

import type { MediaType, MediaUsage } from '@/admin/lib/validations/media'

/**
 * 選択モード
 */
export type SelectionMode = 'single' | 'multiple'

/**
 * タブ種別
 */
export type MediaPickerTab = 'library' | 'url' | 'upload'

/**
 * 選択されたメディアの情報
 */
export interface SelectedMedia {
  /** メディアID（ライブラリ選択時のみ、URL入力/新規アップロード時はnull） */
  id: string | null
  /** メディアURL */
  url: string
  /** 代替テキスト */
  alt?: string
  /** ファイル名 */
  filename?: string
  /** 選択元 */
  source: 'library' | 'url' | 'upload'
}

/**
 * メディアピッカー設定
 */
export interface MediaPickerConfig {
  /** 選択モード */
  selectionMode: SelectionMode
  /** 複数選択時の最大数 */
  maxSelections?: number
  /** 許可するメディアタイプ */
  acceptedTypes?: MediaType[]
  /** デフォルトの用途 */
  defaultUsage?: MediaUsage
  /** URLタブを表示するか */
  showUrlTab?: boolean
}

/**
 * メディアメタデータ（アップロード時）
 */
export interface MediaMetadata {
  alt?: string
  title?: string
  description?: string
  tags?: string[]
}

/**
 * フィルター条件
 */
export interface MediaFilters {
  type?: MediaType
  usage?: MediaUsage
  search?: string
}

/**
 * ページネーション
 */
export interface MediaPagination {
  page: number
  limit: number
}
