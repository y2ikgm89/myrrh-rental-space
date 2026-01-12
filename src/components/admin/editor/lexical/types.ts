/**
 * Lexical Editor Types
 *
 * エディタ関連の型定義
 */

import type { LexicalEditor } from 'lexical'

/**
 * エディタのプロップス
 */
export type LexicalEditorProps = {
  /** 初期コンテンツ（HTML文字列） */
  content?: string
  /** コンテンツ変更時のコールバック */
  onChange?: (html: string) => void
  /** プレースホルダーテキスト */
  placeholder?: string
  /** 編集不可状態 */
  disabled?: boolean
  /** 追加のCSSクラス */
  className?: string
  /** 文字数制限 */
  characterLimit?: number
  /** 最小高さ */
  minHeight?: string
  /** ツールバー表示 */
  showToolbar?: boolean
  /** フローティングツールバー表示 */
  showFloatingToolbar?: boolean
}

/**
 * ツールバーのプロップス
 */
export type ToolbarProps = {
  editor: LexicalEditor
  disabled?: boolean
}

/**
 * フローティングツールバーのプロップス
 */
export type FloatingToolbarProps = {
  editor: LexicalEditor
  anchorElem: HTMLElement
}

/**
 * PostListWidgetの属性
 */
export type PostListWidgetAttributes = {
  type: 'recent' | 'popular' | 'category'
  count: number
  categoryId?: string
}

/**
 * 画像ノードの属性
 */
export type ImageNodeAttributes = {
  src: string
  alt?: string
  width?: number
  height?: number
}

/**
 * YouTubeノードの属性
 */
export type YouTubeNodeAttributes = {
  videoId: string
  width?: number
  height?: number
}

/**
 * ツールバーボタンの状態
 */
export type ToolbarButtonState = {
  bold: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
  subscript: boolean
  superscript: boolean
  code: boolean
  link: boolean
  highlight: boolean
}

/**
 * ブロックタイプ
 */
export type BlockType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'bullet'
  | 'number'
  | 'check'
  | 'quote'
  | 'code'
