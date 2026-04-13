/**
 * インラインエディターコンポーネント
 *
 * 公式 Lexical / Gutenberg パターンに準拠
 * - 専用エディターフック（usePostEditor, useNewsEditor）
 * - 本文と記事設定は独立した RHF フォーム + Server Action で管理
 * - 設定 UI は SettingsDialog（Radix Dialog）
 */

// 設定ダイアログ定義
export { postSettingsPanel, newsSettingsPanel } from "./content-types";

// 型定義
export type {
  CategoryOption,
  TagOption,
  PostSidePanelExtra,
  NewsSidePanelExtra,
  SidePanelDefinition,
  SidePanelInjectedProps,
  SidePanelRenderContext,
} from "./content-types";

// 基本フック
export {
  useFullscreenMode,
  useKeyboardShortcuts,
  useBeforeUnload,
  useCommentPanel,
} from "./hooks";

// 専用エディターフック
export { usePostEditor, useNewsEditor, useContentWidth } from "./hooks/index";

// 基本コンポーネント
export { EditorHeader } from "./EditorHeader";
export { SettingsDialog } from "./SettingsDialog";
export type { SettingsDialogProps } from "./SettingsDialog";
export { InlineEditorShell } from "./InlineEditorShell";

// 旧型定義（side-panel フィールドコンポーネントが使用）
export type {
  EditorHeaderProps,
  SidePanelSectionProps,
  PostEditorFormData,
  PostCategoryOption,
  NewsEditorFormData,
} from "./types";

// Re-export AddCommentPayload for convenience
export type { AddCommentPayload } from "../lexical/types";
