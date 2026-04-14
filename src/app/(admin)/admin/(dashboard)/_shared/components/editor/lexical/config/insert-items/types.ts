/**
 * Insert Items Configuration — 共有型・定数・ヘルパー
 *
 * @description ToolbarPlugin / ComponentPickerPlugin 共通のインサートアイテム定義の
 * 型・メタデータ・$ API ヘルパーを集約する。
 *
 * 実アイテム定義は `./media` / `./embed` / `./layout` / `./structure` に分割。
 * 集約と query 関数は `./index` で実装。
 */

import type { ComponentType } from "react";
import type { ElementNode, LexicalEditor } from "lexical";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
} from "lexical";
import { $setBlocksType } from "@lexical/selection";
import type { DialogId } from "../../dialogs/dialog-types";

// =============================================================================
// Types
// =============================================================================

export type InsertCategory =
  | "basic"
  | "list"
  | "media"
  | "layout"
  /** 料金表・タイムライン等の複合コンテンツブロック（レイアウト骨格とは分離） */
  | "patterns"
  | "format"
  | "widget"
  | "other"
  | "template";

export type IconComponent = ComponentType<{
  size?: number | string;
  color?: string;
  className?: string;
}>;

type InsertItemBase = {
  id: string;
  label: string;
  icon: IconComponent;
  keywords: readonly string[];
  category: InsertCategory;
  /** Toolbar Insert メニューに表示するか */
  showInToolbar: boolean;
  /** ComponentPicker "/" に表示するか */
  showInPicker: boolean;
};

export type DialogInsertItem = InsertItemBase & {
  type: "dialog";
  dialogId: DialogId;
};

export type CommandInsertItem = InsertItemBase & {
  type: "command";
  dispatch: (editor: LexicalEditor) => void;
};

export type TransformInsertItem = InsertItemBase & {
  type: "transform";
  /**
   * 呼び出し側の `editor.update` コールバック内でのみ実行すること。
   * `$getSelection` / `$setBlocksType` 等の Lexical $ API のみ使用し、
   * ネストした `editor.update` を起動しない。
   */
  applyInUpdate: () => void;
};

export type InsertItem =
  | DialogInsertItem
  | CommandInsertItem
  | TransformInsertItem;

// =============================================================================
// Category Labels
// =============================================================================

export const CATEGORY_LABELS: Record<InsertCategory, string> = {
  basic: "基本ブロック",
  list: "リスト",
  media: "メディア",
  layout: "レイアウト",
  patterns: "コンテンツパターン",
  format: "テキスト変換",
  widget: "ウィジェット",
  other: "その他",
  template: "テンプレート",
};

export const CATEGORY_ORDER: readonly InsertCategory[] = [
  "basic",
  "list",
  "media",
  "layout",
  "patterns",
  "format",
  "widget",
  "other",
  "template",
] as const;

/** セパレータを表示しないカテゴリ遷移ペア（挿入メニュー root のビジュアルグループ化用） */
export const MERGED_CATEGORY_PAIRS: ReadonlySet<string> = new Set([
  "media→layout",
  "layout→patterns",
]);

// =============================================================================
// Helpers for transform items ($ API only; caller must be inside editor.update)
// =============================================================================

export function applySetBlocksType(createNode: () => ElementNode): void {
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    $setBlocksType(selection, createNode);
  }
}

export function createParagraphBlock(): void {
  applySetBlocksType(() => $createParagraphNode());
}
