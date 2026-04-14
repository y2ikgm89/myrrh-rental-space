/**
 * Insert Items Configuration — barrel
 *
 * @description ToolbarPlugin / ComponentPickerPlugin 共通のインサートアイテム定義。
 *
 * 実アイテムはカテゴリ別に分割:
 * - `./structure` — 基本ブロック / リスト / テキスト変換 / ウィジェット / その他 / テンプレート
 * - `./media` — 画像 / 音声 / ファイル / ギャラリー / テーブル
 * - `./embed` — YouTube / Vimeo / X / Instagram / Maps / Figma / Spotify / Bookmark
 * - `./layout` — レイアウト骨格 + コンテンツパターン
 *
 * 新しいインサートアイテムを追加する場合:
 * 1. 該当カテゴリのファイルに `InsertItem` エントリーを追加
 * 2. `type: "dialog"` の場合は `../dialog-registry.ts` にもエントリーを追加
 *
 * 挿入の実行は Lexical の推奨どおり **単一の `editor.update` 内**にまとめる。
 * スラッシュメニューは `applyInsertItemInUpdate`、ツールバーは `executeInsertItem` を使う。
 *
 * @remarks Lexical 内部の barrel export として許容（`.claude/rules/gotchas.md` §Lexical 例外）。
 */

import type { LexicalEditor } from "lexical";
import type { DialogId } from "../../dialogs/dialog-types";
import { EMBED_INSERT_ITEMS } from "./embed";
import { LAYOUT_INSERT_ITEMS } from "./layout";
import { MEDIA_INSERT_ITEMS } from "./media";
import { STRUCTURE_INSERT_ITEMS } from "./structure";
import type { InsertItem } from "./types";

// =============================================================================
// Re-exports — types & metadata
// =============================================================================

export {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  MERGED_CATEGORY_PAIRS,
} from "./types";

export type {
  CommandInsertItem,
  DialogInsertItem,
  IconComponent,
  InsertCategory,
  InsertItem,
  TransformInsertItem,
} from "./types";

// =============================================================================
// Aggregated Insert Items
// =============================================================================

/**
 * 全インサートアイテムの集約配列。
 *
 * 並び順は挿入メニュー root のカテゴリ順序と一致させる:
 * structure（basic → list → format → widget → other → template）
 * → media → embed → layout（layout → patterns）
 */
const INSERT_ITEMS: readonly InsertItem[] = [
  ...STRUCTURE_INSERT_ITEMS,
  ...MEDIA_INSERT_ITEMS,
  ...EMBED_INSERT_ITEMS,
  ...LAYOUT_INSERT_ITEMS,
];

// =============================================================================
// Query Functions
// =============================================================================

/** Toolbar用: showInToolbar=trueのアイテム。dialog系はopenDialogがある場合のみ含む */
export function getToolbarInsertItems(
  hasDialog: boolean,
): readonly InsertItem[] {
  return INSERT_ITEMS.filter((item) => {
    if (!item.showInToolbar) return false;
    if (item.type === "dialog" && !hasDialog) return false;
    return true;
  });
}

/** ComponentPicker用: showInPicker=trueのアイテム。dialog系はopenDialogがある場合のみ含む */
export function getPickerInsertItems(
  hasDialog: boolean,
): readonly InsertItem[] {
  return INSERT_ITEMS.filter((item) => {
    if (!item.showInPicker) return false;
    if (item.type === "dialog" && !hasDialog) return false;
    return true;
  });
}

/**
 * ツールバー「挿入」など、既存の update 外から挿入を実行する。
 * ダイアログ型は同期的に `openDialog` のみ。それ以外は 1 回の `editor.update` に集約する。
 */
export function executeInsertItem(
  item: InsertItem,
  editor: LexicalEditor,
  openDialog?: (id: DialogId) => void,
): void {
  if (item.type === "dialog") {
    openDialog?.(item.dialogId);
    return;
  }
  editor.update(() => {
    applyInsertItemInUpdate(item, editor, openDialog);
  });
}

/**
 * 既に `editor.update` のコールバック内にいるときに呼ぶ（スラッシュメニューと併用）。
 * ダイアログ型は `openDialog` を `queueMicrotask` で遅延し、同一 update 内の DOM 確定後に開く。
 */
export function applyInsertItemInUpdate(
  item: InsertItem,
  _editor: LexicalEditor,
  openDialog?: (id: DialogId) => void,
): void {
  switch (item.type) {
    case "dialog": {
      const dialogId = item.dialogId;
      queueMicrotask(() => {
        openDialog?.(dialogId);
      });
      break;
    }
    case "command":
      item.dispatch(_editor);
      break;
    case "transform":
      item.applyInUpdate();
      break;
  }
}
