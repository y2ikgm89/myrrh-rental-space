/**
 * Lexical Editor 型定義
 *
 * @description エディタコンポーネントの型定義
 */

import type { CSSProperties } from "react";

/**
 * コメント追加ペイロード
 */
export type AddCommentPayload = {
  markId: string;
  quotedText: string;
};

/**
 * LexicalEditor コンポーネントのプロパティ
 *
 * JSON primary + HTML cache パターン:
 * - contentJson があれば JSON から EditorState を復元（プライマリ）
 * - contentJson がなく contentHtml がある場合は HTML からフォールバック復元（レガシー）
 * - onChange は JSON 文字列を返す
 */
export type LexicalEditorProps = {
  /** EditorState JSON 文字列（プライマリ） */
  contentJson?: string | null;
  /** レガシー HTML コンテンツ（contentJson がない場合のフォールバック） */
  contentHtml?: string;
  /** コンテンツ変更時のコールバック（JSON文字列を返す） */
  onChange?: (json: string) => void;
  /** エディタを無効化するかどうか */
  disabled?: boolean;
  /** エディタのCSSクラス */
  className?: string;
  /** ツールバーを表示するかどうか */
  showToolbar?: boolean;
  /** インスペクターサイドバーを表示するかどうか */
  showInspector?: boolean;
  /** エディタの高さ */
  height?: string;
  /** プレースホルダーテキスト */
  placeholder?: string;
  /** マークノードクリック時のコールバック */
  onMarkClick?: (markId: string) => void;
  /** コメント追加時のコールバック（FloatingToolbarからのコメントボタンクリック） */
  onAddComment?: (payload: AddCommentPayload) => void;
  /** コンテンツ幅制御用クラス名（公開ページと同じ幅を適用） */
  contentWidthClassName?: string;
  /** コンテンツ幅制御用スタイル（カスタム幅用） */
  contentWidthStyle?: CSSProperties;
  /** オートセーブコールバック（Server Action経由保存） */
  onAutoSave?: (json: string) => Promise<void>;
  /** オートセーブのstorageキー（LocalStorage保存用） */
  autoSaveKey?: string;
  /** 文字数制限（指定時のみ CharacterLimitPlugin をマウント） */
  characterLimit?: number;
};
