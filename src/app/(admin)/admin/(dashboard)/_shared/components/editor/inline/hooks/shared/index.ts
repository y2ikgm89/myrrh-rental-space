/**
 * 共有エディターユーティリティ
 */

// 型定義
export type {
  CategoryOption,
  TagOption,
  EditorCoreConfig,
  EditorCoreReturn,
  EditorPanelsReturn,
} from "./types";

// 変換関数
export {
  // 日時変換
  toFormDateString,
  toSubmitDate,
  // コンテンツ幅変換
  toFormContentWidth,
  toSubmitContentWidth,
  toSubmitContentWidthUndefined,
  // 数値変換
  toFormNumberString,
  toSubmitNumber,
  toSubmitNumberUndefined,
  // オプション文字列変換
  toFormString,
  toNullableString,
  toUndefinedString,
  // タグ変換
  toTagsString,
  parseTagsString,
  // boolean変換
  toFormNullableBoolean,
} from "./transforms";

// コアフック
export {
  useEditorCore,
  computeIsDirty,
  createContentChangeHandler,
  createResetHandler,
} from "./use-editor-core";
