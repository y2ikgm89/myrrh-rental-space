/**
 * Lexical Plugins エクスポート
 */

export { ImagePlugin, useImageDialog } from './ImagePlugin'
export {
  HighlightPlugin,
  HighlightCompact,
  useHighlight,
  HIGHLIGHT_COLORS,
  getHighlightColorFromStyle,
  applyHighlightToSelection,
  type HighlightColor,
} from './HighlightPlugin'
export {
  TextColorPlugin,
  TextColorCompact,
  useTextColor,
  TEXT_COLORS,
  getTextColorFromStyle,
  applyTextColorToSelection,
  type TextColor,
  type PresetTextColor,
} from './TextColorPlugin'
export { YouTubePlugin, useYouTubeDialog } from './YouTubePlugin'
export { XPlugin, useXDialog } from './XPlugin'
export { InstagramPlugin, useInstagramDialog } from './InstagramPlugin'
export { LinkDialogPlugin, useLinkDialog } from './LinkDialogPlugin'
export { TableInsertPlugin, useTableDialog } from './TableInsertPlugin'
export { LayoutPlugin, useLayoutDialog, INSERT_LAYOUT_COMMAND } from './LayoutPlugin'
export { ComponentPickerPlugin } from './ComponentPickerPlugin'
export { ToolbarPlugin } from './ToolbarPlugin'
export { DraggableBlockPlugin } from './DraggableBlockPlugin'
export { FloatingToolbarPlugin } from './FloatingToolbarPlugin'
export { FontSizePlugin, useFontSize } from './FontSizePlugin'
export {
  CommentPlugin,
  CommentButton,
  CommentInputDialog,
  useComment,
  useCommentDialog,
  useMarkIds,
  generateMarkId,
  ADD_COMMENT_COMMAND,
  REMOVE_COMMENT_COMMAND,
  CLICK_MARK_COMMAND,
  type AddCommentPayload,
} from './CommentPlugin'
export {
  TextCasePlugin,
  useTextCase,
  applyTextCaseToSelection,
  TEXT_CASE_CONFIG,
  TEXT_CASE_TYPES,
  type TextCaseType,
} from './TextCasePlugin'
