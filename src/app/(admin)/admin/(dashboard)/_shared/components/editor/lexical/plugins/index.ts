/**
 * Lexical Plugins エクスポート
 */

export { ImagePlugin } from "./ImagePlugin";
export {
  HighlightPlugin,
  HighlightCompact,
  useHighlight,
  HIGHLIGHT_COLORS,
  getHighlightColorFromStyle,
  applyHighlightToSelection,
  type HighlightColor,
} from "./HighlightPlugin";
export {
  TextColorPlugin,
  TextColorCompact,
  useTextColor,
  TEXT_COLORS,
  getTextColorFromStyle,
  applyTextColorToSelection,
  type TextColor,
  type PresetTextColor,
} from "./TextColorPlugin";
export { YouTubePlugin } from "./YouTubePlugin";
export { VimeoPlugin } from "./VimeoPlugin";
export { XPlugin } from "./XPlugin";
export { InstagramPlugin } from "./InstagramPlugin";
export { LinkDialogPlugin } from "./LinkDialogPlugin";
export { TableInsertPlugin } from "./TableInsertPlugin";
export {
  LayoutPlugin,
  INSERT_LAYOUT_COMMAND,
  type InsertLayoutPayload,
} from "./LayoutPlugin";
export { ComponentPickerPlugin } from "./ComponentPickerPlugin";
export { ToolbarPlugin } from "./ToolbarPlugin";
export { DraggableBlockPlugin } from "./DraggableBlockPlugin";
export {
  FloatingToolbarPlugin,
  LinkHoverPreviewPlugin,
} from "./FloatingToolbarPlugin";
export { FontSizePlugin, useFontSize } from "./FontSizePlugin";
export {
  CommentPlugin,
  CommentButton,
  useComment,
  useMarkIds,
  generateMarkId,
  ADD_COMMENT_COMMAND,
  REMOVE_COMMENT_COMMAND,
  CLICK_MARK_COMMAND,
  type AddCommentPayload,
} from "./CommentPlugin";
export {
  TextCasePlugin,
  useTextCase,
  applyTextCaseToSelection,
  TEXT_CASE_CONFIG,
  TEXT_CASE_TYPES,
  type TextCaseType,
} from "./TextCasePlugin";

export { PageBreakPlugin, INSERT_PAGE_BREAK_COMMAND } from "./PageBreakPlugin";
export { CalloutPlugin, INSERT_CALLOUT_COMMAND } from "./CalloutPlugin";
export { GroupPlugin, INSERT_GROUP_COMMAND } from "./GroupPlugin";
export {
  CollapsiblePlugin,
  INSERT_COLLAPSIBLE_COMMAND,
  TOGGLE_COLLAPSIBLE_COMMAND,
} from "./CollapsiblePlugin";
export { EmojiPickerPlugin } from "./EmojiPickerPlugin";

// Word count
export {
  WordCountPlugin,
  useWordCount,
  type WordCountData,
} from "./WordCountPlugin";

// Heading anchor auto-generation（目次アンカー ID 自動生成）
export { HeadingAnchorPlugin } from "./HeadingAnchorPlugin";

// Keyboard shortcuts & Auto save
export { KeyboardShortcutsPlugin } from "./KeyboardShortcutsPlugin";
export {
  AutoSavePlugin,
  useAutoSaveStatus,
  getDraftJson,
  clearDraft,
  type SaveStatus,
} from "./AutoSavePlugin";

// Code block enhancement
export { CodeBlockPlugin } from "./CodeBlockPlugin";

// Image drop & Find replace
export { ImageDropPlugin } from "./ImageDropPlugin";
export { FindReplacePlugin } from "./FindReplacePlugin";

// Markdown export
export { MarkdownExportPlugin } from "./MarkdownExportPlugin";

// Custom block plugins
export { ButtonPlugin } from "./ButtonPlugin";
export { PullQuotePlugin } from "./PullQuotePlugin";
export { BookmarkPlugin } from "./BookmarkPlugin";
export { StepsPlugin } from "./StepsPlugin";
export { TabsPlugin } from "./TabsPlugin";

// Block template
export {
  BlockTemplatePlugin,
  SAVE_BLOCK_TEMPLATE_COMMAND,
  INSERT_BLOCK_TEMPLATE_COMMAND,
} from "./BlockTemplatePlugin";
export { MapEmbedPlugin } from "./MapEmbedPlugin";

export { RubyPlugin } from "./RubyPlugin";

export { TooltipPlugin } from "./TooltipPlugin";

export { AudioPlugin } from "./AudioPlugin";

export { FilePlugin } from "./FilePlugin";

export { FigmaPlugin } from "./FigmaPlugin";

export { SpotifyPlugin } from "./SpotifyPlugin";

export { GalleryPlugin } from "./GalleryPlugin";

export { TimelinePlugin } from "./TimelinePlugin";

export { PricingTablePlugin } from "./PricingTablePlugin";

export { TableActionMenuPlugin } from "./TableActionMenuPlugin";

export { InlineImagePlugin } from "./InlineImagePlugin";

export { TestimonialPlugin } from "./TestimonialPlugin";

export { FeatureIconListPlugin } from "./FeatureIconListPlugin";

export { CoverPlugin } from "./CoverPlugin";

export {
  CaptionBoxPlugin,
  INSERT_CAPTION_BOX_COMMAND,
} from "./CaptionBoxPlugin";
