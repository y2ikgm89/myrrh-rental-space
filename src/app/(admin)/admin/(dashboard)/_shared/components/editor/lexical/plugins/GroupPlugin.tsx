/**
 * Group Plugin
 *
 * @description グループ（ボックス装飾コンテナ）の挿入・ラップ・解除と、
 *  作成時に装飾バリアント（15 style × 10 color）を選ばせるダイアログ UI を提供する。
 *
 * 構造:
 * - `OPEN_GROUP_DIALOG_COMMAND` — ダイアログを開く（ツールバー / ショートカット / ⋮⋮ / FT の共通入口）
 * - `INSERT_GROUP_COMMAND`      — ダイアログ確定時、または code path から直接ラップ
 * - `UNGROUP_GROUP_COMMAND`     — 既存 GroupNode の解除
 *
 * isShadowRoot 不要: GroupNode は単一レベルコンテナ（CalloutNode と同パターン）。
 * 矢印キーによるカーソル脱出は Lexical のデフォルト動作で自然に処理される。
 *
 * ネスト方針: WordPress Gutenberg と同等にネスト許可。
 * - Root 直下の複数 Group 選択 → outer Group でラップ
 * - Group 内の段落選択 → inner Group でラップ（ネスト）
 * - Group 自体を Draggable ハンドルで「グループで囲む」→ outer Group でラップ
 *
 * @see https://wordpress.org/documentation/article/group-block/
 */

"use client";

import { useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $findMatchingParent,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  mergeRegister,
  type LexicalCommand,
  type LexicalNode,
} from "lexical";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
} from "@/admin/components/ui";
import { cn } from "@/shared/lib/cn";
import {
  $createGroupNode,
  $isGroupNode,
  $ungroupNode,
  GroupNode,
  GROUP_STYLE_CATEGORIES,
  GROUP_STYLE_LABELS,
  type GroupStyle,
} from "../nodes/GroupNode";
import { type AccentColor } from "../config/accent-colors";
import { $getSelectionBlockNodes } from "../lib/selection-helpers";
import { ColorSwatchPicker } from "../inspector/ColorSwatchPicker";

// =============================================================================
// Commands
// =============================================================================

export type InsertGroupPayload = {
  groupStyle: GroupStyle;
  color?: AccentColor;
  /**
   * ラップ対象ブロックの明示キー群。指定時は現在の選択を無視して
   * これらのノードを 1 つの GroupNode にラップする。
   * 未指定時は `$getSelectionBlockNodes()` の結果を使う。
   */
  targetNodeKeys?: readonly string[];
};

export type OpenGroupDialogPayload = {
  /**
   * ダイアログを開く前にスナップショットする対象ブロックキー群。
   * ダイアログにフォーカスが移ると選択が失われるため、呼び出し側で
   * 先に `$getSelectionBlockNodes()` を実行して key だけ持ち込む。
   */
  targetNodeKeys?: readonly string[];
};

export type UngroupGroupPayload = {
  /** 解除対象 GroupNode のキー。未指定時は選択中の最も近い GroupNode を解除する */
  targetNodeKey?: string;
};

export const OPEN_GROUP_DIALOG_COMMAND: LexicalCommand<OpenGroupDialogPayload> =
  createCommand("OPEN_GROUP_DIALOG");

export const INSERT_GROUP_COMMAND: LexicalCommand<InsertGroupPayload> =
  createCommand("INSERT_GROUP_COMMAND");

export const UNGROUP_GROUP_COMMAND: LexicalCommand<UngroupGroupPayload> =
  createCommand("UNGROUP_GROUP_COMMAND");

// =============================================================================
// Utilities
// =============================================================================

/**
 * 1 つ以上のブロックを新規 GroupNode でラップする。
 * 先頭ノードの位置に Group を挿入し、対象ノード群を順に append する。
 */
function $wrapNodesInGroup(
  targetNodes: readonly LexicalNode[],
  groupStyle: GroupStyle,
  color: AccentColor,
): void {
  const anchor = targetNodes[0];
  if (!anchor) return;

  const group = $createGroupNode(groupStyle, color);
  anchor.insertBefore(group);
  for (const node of targetNodes) {
    group.append(node);
  }
  const firstChild = group.getFirstChild();
  if (firstChild) firstChild.selectStart();
}

/**
 * 現在の選択から最も近い祖先 GroupNode を返す。
 * 見つからない場合は null。
 */
function $findEnclosingGroupFromSelection(): GroupNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const anchor = selection.anchor.getNode();
  const found = $findMatchingParent(anchor, $isGroupNode);
  return found ?? null;
}

/**
 * INSERT_GROUP_COMMAND の本体処理。
 *
 * 3 経路:
 * 1. `targetNodeKeys` 指定: 指定ノード群をラップ（ダイアログ / DraggableBlock ハンドル経由）
 * 2. 選択あり: 選択ブロック粒度のノード群をラップ（ショートカット直接経由）
 * 3. 選択解決不能: 空 Group を最近接ルートに挿入（NodeSelection 等のエッジケース）
 */
function $applyInsertGroup(
  groupStyle: GroupStyle,
  color: AccentColor,
  targetNodeKeys: readonly string[] | undefined,
): void {
  if (targetNodeKeys !== undefined && targetNodeKeys.length > 0) {
    const targetNodes: LexicalNode[] = [];
    for (const key of targetNodeKeys) {
      const node = $getNodeByKey(key);
      if (node) targetNodes.push(node);
    }
    if (targetNodes.length === 0) return;
    $wrapNodesInGroup(targetNodes, groupStyle, color);
    return;
  }

  const blockNodes = $getSelectionBlockNodes();

  if (blockNodes.length === 0) {
    const group = $createGroupNode(groupStyle, color);
    const paragraph = $createParagraphNode();
    group.append(paragraph);
    $insertNodeToNearestRoot(group);
    paragraph.selectEnd();
    return;
  }

  $wrapNodesInGroup(blockNodes, groupStyle, color);
}

// =============================================================================
// Dialog
// =============================================================================

const DEFAULT_GROUP_STYLE: GroupStyle = "solid-border";
const DEFAULT_GROUP_COLOR: AccentColor = "default";

const CATEGORY_ORDER = ["border", "background", "decoration"] as const;
const CATEGORY_HEADINGS: Record<(typeof CATEGORY_ORDER)[number], string> = {
  border: "ボーダー",
  background: "背景",
  decoration: "装飾",
};

type GroupDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  initialStyle: GroupStyle;
  initialColor: AccentColor;
  /** 確定時に呼ばれる。フォーム state と併せて dispatch は親が担う */
  onApply: (style: GroupStyle, color: AccentColor) => void;
};

function StyleOption({
  style,
  color,
  selected,
  onSelect,
}: {
  style: GroupStyle;
  color: AccentColor;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={GROUP_STYLE_LABELS[style]}
      className={cn(
        "flex flex-col items-stretch gap-1.5 rounded-md border-2 p-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-ring bg-accent/5"
          : "border-border hover:border-ring/40",
      )}
    >
      <div
        data-group="true"
        data-group-style={style}
        {...(color !== "default" ? { "data-color": color } : {})}
        className="flex min-h-12 items-center justify-center px-2 py-1.5 text-xs leading-tight text-foreground"
      >
        Aa
      </div>
      <span className="text-xs text-muted-foreground">
        {GROUP_STYLE_LABELS[style]}
      </span>
    </button>
  );
}

function GroupDialog({
  isOpen,
  onClose,
  initialStyle,
  initialColor,
  onApply,
}: GroupDialogProps) {
  const [selectedStyle, setSelectedStyle] = useState<GroupStyle>(initialStyle);
  const [selectedColor, setSelectedColor] = useState<AccentColor>(initialColor);

  const handleClose = () => {
    // 次回オープン時に fresh な状態で始まるようリセット（CalloutPlugin と同パターン）
    setSelectedStyle(initialStyle);
    setSelectedColor(initialColor);
    onClose();
  };

  const handleApply = () => {
    onApply(selectedStyle, selectedColor);
    handleClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>グループ化</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">スタイル</Label>
            <div className="mt-2 space-y-3">
              {CATEGORY_ORDER.map((category) => (
                <div key={category}>
                  <div className="mb-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                    {CATEGORY_HEADINGS[category]}
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {GROUP_STYLE_CATEGORIES[category].map((style) => (
                      <StyleOption
                        key={style}
                        style={style}
                        color={selectedColor}
                        selected={selectedStyle === style}
                        onSelect={() => setSelectedStyle(style)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <ColorSwatchPicker
            value={selectedColor}
            onChange={setSelectedColor}
            label="アクセントカラー"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            キャンセル
          </Button>
          <Button type="button" onClick={handleApply}>
            グループ化
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Component
// =============================================================================

type DialogState = {
  open: boolean;
  targetNodeKeys: readonly string[] | undefined;
};

const CLOSED_STATE: DialogState = { open: false, targetNodeKeys: undefined };

export function GroupPlugin() {
  const [editor] = useLexicalComposerContext();
  const [dialogState, setDialogState] = useState<DialogState>(CLOSED_STATE);

  useEffect(() => {
    return mergeRegister(
      // Open dialog — UI 層からの共通入口
      editor.registerCommand(
        OPEN_GROUP_DIALOG_COMMAND,
        (payload) => {
          // 選択由来キーは呼び出し側で既にスナップショット済み
          setDialogState({
            open: true,
            targetNodeKeys: payload.targetNodeKeys,
          });
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),

      // Insert / wrap
      editor.registerCommand(
        INSERT_GROUP_COMMAND,
        (payload) => {
          editor.update(() => {
            $applyInsertGroup(
              payload.groupStyle,
              payload.color ?? DEFAULT_GROUP_COLOR,
              payload.targetNodeKeys,
            );
          });
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),

      // Ungroup
      editor.registerCommand(
        UNGROUP_GROUP_COMMAND,
        (payload) => {
          editor.update(() => {
            let target: GroupNode | null = null;
            if (payload.targetNodeKey !== undefined) {
              const node = $getNodeByKey(payload.targetNodeKey);
              if ($isGroupNode(node)) target = node;
            } else {
              target = $findEnclosingGroupFromSelection();
            }
            if (target) $ungroupNode(target);
          });
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),

      // Empty Group は段落 1 つで埋める
      editor.registerNodeTransform(GroupNode, (node) => {
        if (node.getChildren().length === 0) {
          const paragraph = $createParagraphNode();
          node.append(paragraph);
        }
      }),
    );
  }, [editor]);

  return (
    <GroupDialog
      isOpen={dialogState.open}
      initialStyle={DEFAULT_GROUP_STYLE}
      initialColor={DEFAULT_GROUP_COLOR}
      onClose={() => setDialogState(CLOSED_STATE)}
      onApply={(style, color) => {
        editor.dispatchCommand(INSERT_GROUP_COMMAND, {
          groupStyle: style,
          color,
          ...(dialogState.targetNodeKeys !== undefined
            ? { targetNodeKeys: dialogState.targetNodeKeys }
            : {}),
        });
      }}
    />
  );
}
