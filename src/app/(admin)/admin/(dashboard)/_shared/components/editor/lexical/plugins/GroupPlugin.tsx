/**
 * Group Plugin
 *
 * @description グループ（ボックス装飾コンテナ）の挿入と構造管理
 *
 * isShadowRoot 不要: GroupNode は単一レベルコンテナ（CalloutNode と同パターン）。
 * 矢印キーによるカーソル脱出は Lexical のデフォルト動作で自然に処理される。
 * isShadowRoot が必要なのはコンポジットノード（Collapsible/Steps/Tabs 等の
 * Title/Content 内部構造を持つもの）のみ。
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
  createCommand,
  mergeRegister,
  type ElementNode,
  type LexicalCommand,
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

  // 既に GroupNode 内にいる場合は何もしない（二重ネスト防止）
  const firstNode = topLevelNodes[0];
  if (firstNode && $isGroupNode(firstNode)) {
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
