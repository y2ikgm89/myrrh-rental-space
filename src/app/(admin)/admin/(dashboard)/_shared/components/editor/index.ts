/**
 * エディタコンポーネント エクスポート
 *
 * Lexicalベースのリッチテキストエディタ
 */

// メインエディタ
export { LexicalEditor, LexicalEditor as RichTextEditor } from "./lexical";
export type {
  LexicalEditorProps,
  LexicalEditorProps as RichTextEditorProps,
} from "./lexical";

// ノード
export { ImageNode, YouTubeNode } from "./lexical";

// プラグイン
export { ToolbarPlugin, ImagePlugin, YouTubePlugin } from "./lexical";
