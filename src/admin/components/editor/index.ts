/**
 * エディタコンポーネント エクスポート
 *
 * Lexicalベースのリッチテキストエディタ
 */

// メインエディタ（後方互換性のためRichTextEditorとしてもエクスポート）
export { LexicalEditor, LexicalEditor as RichTextEditor } from './lexical'
export type { LexicalEditorProps, LexicalEditorProps as RichTextEditorProps } from './lexical'

// ノード
export {
  ImageNode,
  YouTubeNode,
  PostListWidgetNode,
  type PostListWidgetType,
} from './lexical'

// プラグイン
export {
  ToolbarPlugin,
  FloatingToolbarPlugin,
  ImagePlugin,
  YouTubePlugin,
  PostListWidgetPlugin,
} from './lexical'
