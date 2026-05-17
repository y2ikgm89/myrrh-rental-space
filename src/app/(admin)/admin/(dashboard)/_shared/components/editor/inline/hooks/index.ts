/**
 * エディター専用フック
 *
 * 各コンテンツタイプ専用の型安全なフック
 */

// 専用フック
export { usePostEditor } from "./usePostEditor";
export { useNewsEditor } from "./useNewsEditor";

// コンテンツ幅 pure function
export { resolveContentWidthPx } from "./content-width";

// 共有ユーティリティ
export {
  // 型定義
  type CategoryOption,
  type TagOption,
  type EditorCoreReturn,
  type CommentPanelReturn,
  // 変換関数
  toFormDateString,
  toSubmitDate,
  toFormContentWidth,
  toSubmitContentWidth,
  toSubmitContentWidthUndefined,
  toFormNumberString,
  toSubmitNumber,
  toSubmitNumberUndefined,
  toFormString,
  toNullableString,
  toUndefinedString,
  toTagsString,
  parseTagsString,
  toFormNullableBoolean,
  // コアフック
  useEditorCore,
} from "./shared";
