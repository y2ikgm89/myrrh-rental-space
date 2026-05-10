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
 * 実行モデル:
 * - **command / transform**: `editor.update` 内で `applyInsertItemInUpdate` 経由
 * - **dialog**: `editor.update` の **外** で `openDialog(dialogId)` を同期呼び出し
 *   （React state side-effect のため editor.update 内で起動しない）
 *
 * @remarks Lexical 内部の barrel export として許容（`.claude/rules/gotchas.md` §Lexical 例外）。
 */

import type { LexicalEditor } from "lexical";
import type { DialogId } from "../../dialogs/dialog-types";
import { EMBED_INSERT_ITEMS } from "./embed";
import { LAYOUT_INSERT_ITEMS } from "./layout";
import { MEDIA_INSERT_ITEMS } from "./media";
import { STRUCTURE_INSERT_ITEMS } from "./structure";
import type {
  CommandInsertItem,
  InsertItem,
  TransformInsertItem,
} from "./types";

/**
 * `editor.update` 内で適用可能なインサートアイテム（dialog を含まない）。
 *
 * Dialog 起動は React state side-effect のため editor.update の外で実行する設計。
 * 型レベルで `applyInsertItemInUpdate` の引数を非 dialog に narrow して
 * 呼び出し側の dialog 取りこぼしを防止する。
 */
export type ApplyableInsertItem = CommandInsertItem | TransformInsertItem;

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
 *
 * - **dialog**: 同期的に `openDialog(dialogId)` のみ呼ぶ（editor.update に入らない）
 * - **command / transform**: 1 回の `editor.update` に `applyInsertItemInUpdate` を集約
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
    applyInsertItemInUpdate(item, editor);
  });
}

/**
 * `editor.update` のコールバック内で `command` / `transform` 型を適用する。
 *
 * 引数型は `ApplyableInsertItem`（dialog 排除）で narrow 済み。
 * Dialog 起動は React state side-effect のため editor.update の外（呼び出し側）で
 * `openDialog(item.dialogId)` を同期呼び出しすること（旧 `queueMicrotask` ハック廃止）。
 */
export function applyInsertItemInUpdate(
  item: ApplyableInsertItem,
  editor: LexicalEditor,
): void {
  switch (item.type) {
    case "command":
      item.dispatch(editor);
      break;
    case "transform":
      item.applyInUpdate();
      break;
  }
}
