/**
 * Lexical Editor 型定義
 *
 * @description エディタコンポーネントの型定義
 */

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
 * 保存形式は EditorState JSON のみ。`lexicalJsonSchema` を満たすこと（空本文は `EMPTY_LEXICAL_EDITOR_STATE_JSON`）。満たさない場合はマウントせずエラー表示する。
 * onChange は JSON 文字列を返す。
 */
export type LexicalEditorProps = {
  /** EditorState JSON 文字列（必須・プライマリ） */
  contentJson: string;
  /** コンテンツ変更時のコールバック（JSON文字列を返す） */
  onChange?: ((json: string) => void) | undefined;
  /** エディタを無効化するかどうか */
  disabled?: boolean | undefined;
  /** エディタのCSSクラス */
  className?: string | undefined;
  /** ツールバーを表示するかどうか */
  showToolbar?: boolean | undefined;
  /** インスペクターサイドバーを表示するかどうか */
  showInspector?: boolean | undefined;
  /** エディタの高さ */
  height?: string | undefined;
  /** プレースホルダーテキスト */
  placeholder?: string | undefined;
  /** マークノードクリック時のコールバック */
  onMarkClick?: ((markId: string | null) => void) | undefined;
  /** コメント追加時のコールバック（FloatingToolbarからのコメントボタンクリック） */
  onAddComment?: ((payload: AddCommentPayload) => void) | undefined;
  /**
   * コンテンツ幅（px）— テキスト領域の幅を指定。
   * エディタのパディング（ドラッグハンドル用ガター等）は内部で自動加算される。
   * 未指定時はエディタ全幅。
   */
  contentWidth?: number | undefined;
  /** オートセーブコールバック（Server Action経由保存） */
  onAutoSave?: ((json: string) => Promise<void>) | undefined;
  /** オートセーブのstorageキー（LocalStorage保存用） */
  autoSaveKey?: string | undefined;
  /** 文字数制限（指定時のみ CharacterLimitPlugin をマウント） */
  characterLimit?: number | undefined;
};
