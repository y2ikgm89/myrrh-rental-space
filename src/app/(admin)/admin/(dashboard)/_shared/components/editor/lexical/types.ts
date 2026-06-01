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
  /**
   * 外枠の角丸・枠線を外して edge-to-edge にする（フル画面インライン編集用）。
   * InlineEditorShell 配下（Post / News）のように画面全幅・全高で表示する場合に true。
   * タブ/ダイアログ内の埋め込みエディタ（既定）は角丸カード見た目を維持する。
   */
  flush?: boolean | undefined;
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
  /**
   * インスペクターサイドバーの右に追加で表示するパネル（記事設定パネル等）
   * LexicalEditor の flex 行（ツールバーの下）に配置されるため、
   * InspectorSidebar と同じ高さ位置から始まる。
   */
  trailingPanel?: import("react").ReactNode;
};
