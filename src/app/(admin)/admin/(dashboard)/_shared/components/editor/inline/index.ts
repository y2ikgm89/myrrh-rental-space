/**
 * インラインエディターコンポーネント
 *
 * 公式Lexical/Gutenbergパターンに準拠
 * - 専用エディターフック（usePostEditor, useNewsEditor, usePageEditor）
 * - フック経由でフルスクリーン・キーボード・離脱警告を管理
 */

// 設定
export {
  postConfig,
  newsConfig,
  pageConfig,
} from './content-types'

// 型定義
export type {
  ContentTypeConfig,
  ContentEditorProps,
  ContentEditorExtraData,
  CategoryOption,
  TagOption,
} from './content-types'

// 基本フック
export {
  useFullscreenMode,
  useKeyboardShortcuts,
  useBeforeUnload,
  useEditorPanels,
} from './hooks'

// 専用エディターフック
export {
  usePostEditor,
  useNewsEditor,
  usePageEditor,
  useContentWidthStyles,
} from './hooks/index'

// 基本コンポーネント
export { EditorHeader } from './EditorHeader'
export { SidePanelShell, SIDE_PANEL_WIDTH } from './SidePanelShell'
export { UnifiedSidePanel } from './UnifiedSidePanel'
export { InlineEditorShell } from './InlineEditorShell'

// 旧型定義（後方互換性のため一時的に維持）
export type {
  PageEditorFormData,
  EditorHeaderProps,
  SidePanelSectionProps,
  PostEditorFormData,
  PostCategoryOption,
  NewsEditorFormData,
} from './types'

// Re-export AddCommentPayload for convenience
export type { AddCommentPayload } from '../lexical/types'
