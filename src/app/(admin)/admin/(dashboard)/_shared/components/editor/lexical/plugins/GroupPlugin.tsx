/**
 * Group Plugin
 *
 * @description グループ（ボックス装飾コンテナ）の挿入と構造管理
 */

"use client";

import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  createCommand,
  mergeRegister,
  type ElementNode,
  type LexicalCommand,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import { $insertNodeToNearestRoot, $findMatchingParent } from "@lexical/utils";
import {
  $createGroupNode,
  $isGroupNode,
  GroupNode,
  type GroupStyle,
} from "../nodes/GroupNode";

// =============================================================================
// Commands
// =============================================================================

export type InsertGroupPayload = {
  groupStyle: GroupStyle;
};

export const INSERT_GROUP_COMMAND: LexicalCommand<InsertGroupPayload> =
  createCommand("INSERT_GROUP_COMMAND");

// =============================================================================
// Utilities
// =============================================================================

/**
 * 選択中のトップレベルブロックを取得（重複排除・ドキュメント順）
 */
function $getSelectedTopLevelNodes(): LexicalNode[] {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return [];

  const nodes = selection.getNodes();
  const topLevelSet = new Set<string>();
  const topLevelNodes: LexicalNode[] = [];

  for (const node of nodes) {
    const topLevel =
      $findMatchingParent(node, (parent): parent is ElementNode => {
        const grandParent = parent.getParent();
        return grandParent !== null && $isRootOrShadowRoot(grandParent);
      }) ?? node;

    const key = topLevel.getKey();
    if (!topLevelSet.has(key)) {
      topLevelSet.add(key);
      topLevelNodes.push(topLevel);
    }
  }

  return topLevelNodes;
}

/**
 * 選択中のブロックを GroupNode でラップ
 * 単一ブロック or 複数ブロックを囲む
 */
function $wrapInGroup(groupStyle: GroupStyle): void {
  const topLevelNodes = $getSelectedTopLevelNodes();

  // 選択なし or 選択ブロックがゼロ → 空グループ挿入
  if (topLevelNodes.length === 0) {
    const group = $createGroupNode(groupStyle);
    const paragraph = $createParagraphNode();
    group.append(paragraph);
    $insertNodeToNearestRoot(group);
    paragraph.selectEnd();
    return;
  }

  // 既に GroupNode 内にいる場合はスタイル変更のみ（二重ネスト防止）
  const firstNode = topLevelNodes[0];
  if (firstNode && $isGroupNode(firstNode)) {
    // 単一ブロック選択で既にグループ → 何もしない（Inspector で変更）
    return;
  }

  // 選択ブロックを GroupNode でラップ
  const group = $createGroupNode(groupStyle);
  const anchor = topLevelNodes[0];
  if (!anchor) return;
  anchor.insertBefore(group);

  for (const node of topLevelNodes) {
    group.append(node);
  }

  // グループ内の最初のブロックの先頭にカーソル
  const firstChild = group.getFirstChild();
  if (firstChild) {
    firstChild.selectStart();
  }
}

function $onEscape(editor: LexicalEditor, direction: "up" | "down"): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  const node = selection.anchor.getNode();
  let groupNode: GroupNode | null = null;
  let current = node.getParent();

  while (current) {
    if ($isGroupNode(current)) {
      groupNode = current;
      break;
    }
    current = current.getParent();
  }

  if (!groupNode) return false;

  const isAtStart = selection.anchor.offset === 0;
  const isAtEnd =
    selection.anchor.offset === selection.anchor.getNode().getTextContentSize();

  if ((direction === "up" && isAtStart) || (direction === "down" && isAtEnd)) {
    const paragraph = $createParagraphNode();
    if (direction === "up") {
      groupNode.insertBefore(paragraph);
    } else {
      groupNode.insertAfter(paragraph);
    }
    paragraph.select();
    return true;
  }

  return false;
}

// =============================================================================
// Component
// =============================================================================

export function GroupPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        INSERT_GROUP_COMMAND,
        (payload) => {
          editor.update(() => {
            $wrapInGroup(payload.groupStyle);
          });
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        () => $onEscape(editor, "up"),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        () => $onEscape(editor, "down"),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerNodeTransform(GroupNode, (node) => {
        if (node.getChildren().length === 0) {
          const paragraph = $createParagraphNode();
          node.append(paragraph);
        }
      }),
    );
  }, [editor]);

  return null;
}
