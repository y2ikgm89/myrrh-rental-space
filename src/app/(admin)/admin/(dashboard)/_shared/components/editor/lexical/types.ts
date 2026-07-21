/**
 * Lexical Editor 型定義
 *
 * @description エディタコンポーネントの型定義
 */

import type { MediaUsage } from "@/admin/lib/validations/media";

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
  /**
   * エディタ本体（ContentEditable、role="textbox"）のアクセシブルネーム。
   * `contentEditableId` 未指定時は既定で「本文」。`contentEditableId` 指定時は
   * こちらを省略すると `aria-label` を出力せず、視認ラベルの `htmlFor`
   * とのネイティブ関連付け（label-for）にアクセシブルネーム解決を委ねる。
   */
  ariaLabel?: string | undefined;
  /** エディタ本体（ContentEditable）に紐づけるエラーメッセージ等の要素ID（aria-describedby） */
  ariaDescribedBy?: string | undefined;
  /**
   * ContentEditable の実 DOM 要素に付与する `id`。呼び出し元に視認可能な
   * `<Label htmlFor="...">` が隣接して存在する場合、その `htmlFor` と同じ値を
   * 渡すことで、ラベルのテキストがそのままエディタのアクセシブルネームになる
   * （ネイティブ label-for 関連付け）。指定時は `ariaLabel` を渡さないこと
   * （`aria-label` は label-for 関連付けより優先されるため、視認ラベルと
   * アクセシブルネームが乖離する）。
   */
  contentEditableId?: string | undefined;
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
  /**
   * 画像/音声/ファイルの挿入・アップロード時に付与する MediaUsage。
   * 省略時は既存挙動と互換の既定値（"POST"）にフォールバックする
   * （`media-usage-context.ts` の `DEFAULT_MEDIA_USAGE`）。
   * 呼び出し元（Post/News/Event/Space/Terms 編集フォーム等）は
   * 対応する用途を明示的に渡すこと。
   */
  mediaUsage?: MediaUsage | undefined;
};
