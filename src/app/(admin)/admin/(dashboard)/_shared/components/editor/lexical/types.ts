/**
 * Lexical Editor 型定義
 *
 * @description エディタコンポーネントの型定義
 */

import type { CSSProperties } from 'react'
import type { SerializedEditorState, SerializedLexicalNode } from 'lexical'

/**
 * コメント追加ペイロード
 */
export type AddCommentPayload = {
  markId: string
  quotedText: string
}

/**
 * LexicalEditor コンポーネントのプロパティ
 */
export type LexicalEditorProps = {
  /** 初期コンテンツ（HTML形式） */
  content?: string
  /** コンテンツ変更時のコールバック（HTML形式で返す） */
  onChange?: (html: string) => void
  /** エディタを無効化するかどうか */
  disabled?: boolean
  /** エディタのCSSクラス */
  className?: string
  /** ツールバーを表示するかどうか */
  showToolbar?: boolean
  /** インスペクターサイドバーを表示するかどうか */
  showInspector?: boolean
  /** エディタの高さ */
  height?: string
  /** プレースホルダーテキスト */
  placeholder?: string
  /** マークノードクリック時のコールバック */
  onMarkClick?: (markId: string) => void
  /** コメント追加時のコールバック（FloatingToolbarからのコメントボタンクリック） */
  onAddComment?: (payload: AddCommentPayload) => void
  /** コンテンツ幅制御用クラス名（公開ページと同じ幅を適用） */
  contentWidthClassName?: string
  /** コンテンツ幅制御用スタイル（カスタム幅用） */
  contentWidthStyle?: CSSProperties
}

/**
 * シリアライズされたエディタ状態
 */
export type SerializedLexicalState = SerializedEditorState<SerializedLexicalNode>

/**
 * 画像ノードのプロパティ
 */
export type ImageNodePayload = {
  src: string
  alt?: string
  width?: number
  height?: number
}

/**
 * YouTubeノードのプロパティ
 */
export type YouTubeNodePayload = {
  videoId: string
}
