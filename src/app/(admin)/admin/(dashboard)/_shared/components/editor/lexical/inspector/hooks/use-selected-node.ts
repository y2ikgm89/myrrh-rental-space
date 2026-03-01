/**
 * 選択中ノード検出フック
 *
 * @description
 * Lexicalエディタ内で選択されているノードを監視し、
 * インスペクター対象のノードが選択されている場合にその情報を返す。
 *
 * 対応する選択パターン：
 * - NodeSelection: DecoratorNode（Button, Image, Bookmark）をクリックした場合
 * - RangeSelection: ElementNode（Callout）内にカーソルがある場合
 *
 * @module
 */

"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  SELECTION_CHANGE_COMMAND,
  mergeRegister,
  COMMAND_PRIORITY_LOW,
  type LexicalNode,
} from "lexical";
import { $isTableSelection } from "@lexical/table";
import { $isCustomTableNode } from "../../nodes/CustomTableNode";

import {
  getInspectableInfo,
  type SelectedNodeInfo,
  type InspectableNodeType,
} from "./inspectable-nodes";

// =============================================================================
// Re-exports
// =============================================================================

export type { SelectedNodeInfo, InspectableNodeType };

// =============================================================================
// Hook
// =============================================================================

/**
 * 選択中のインスペクター対象ノードを返すフック
 *
 * @description
 * SELECTION_CHANGE_COMMANDとエディタ更新を監視し、
 * 現在選択されているノードがインスペクター対象であればその情報を返す。
 *
 * このフックは以下のLexical APIを使用:
 * - `SELECTION_CHANGE_COMMAND`: 選択変更の検出
 * - `registerUpdateListener`: エディタ状態変更の検出（ノードプロパティ変更時）
 * - `mergeRegister`: 複数リスナーの一括解除
 *
 * @returns 選択中のノード情報、または選択がない/対象外の場合はnull
 *
 * @example
 * ```tsx
 * function InspectorSidebar() {
 *   const selectedNode = useSelectedNode()
 *
 *   if (!selectedNode) {
 *     return <div>ノードを選択してください</div>
 *   }
 *
 *   switch (selectedNode.nodeType) {
 *     case 'button':
 *       return <ButtonInspectorPanel node={selectedNode.node} />
 *     // ...
 *   }
 * }
 * ```
 */
export function useSelectedNode(): SelectedNodeInfo {
  const [editor] = useLexicalComposerContext();
  const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo>(null);

  /**
   * 選択状態を読み取り、インスペクター対象ノードを特定する
   */
  const updateSelectedNode = useEffectEvent(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();

      // NodeSelection: DecoratorNode（Button, Image等）が選択された場合
      if ($isNodeSelection(selection)) {
        const nodes = selection.getNodes();
        const singleNode = nodes.length === 1 ? nodes[0] : undefined;
        if (singleNode) {
          const info = getInspectableInfo(singleNode);
          if (info) {
            setSelectedNode(info);
            return;
          }
        }
      }

      // TableSelection: セル範囲選択時はテーブルノードをインスペクト
      if ($isTableSelection(selection)) {
        const tableNode = $getNodeByKey(selection.tableKey);
        if ($isCustomTableNode(tableNode)) {
          setSelectedNode({
            nodeType: "table",
            node: tableNode,
            nodeKey: tableNode.getKey(),
          });
          return;
        }
      }

      // RangeSelection: ElementNode（Callout等）内にカーソルがある場合
      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode();
        // 親をたどってInspectableNodeを探す
        let current: LexicalNode | null = anchorNode;
        while (current !== null) {
          const info = getInspectableInfo(current);
          if (info) {
            setSelectedNode(info);
            return;
          }
          current = current.getParent();
        }
      }

      // 該当なし
      setSelectedNode(null);
    });
  });

  useEffect(() => {
    // 初回実行
    updateSelectedNode();

    // リスナー登録
    // - SELECTION_CHANGE_COMMAND: 選択が変わった時
    // - registerUpdateListener: ノードのプロパティが変わった時（パネルに反映するため）
    return mergeRegister(
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateSelectedNode();
          return false; // 他のハンドラにも伝播させる
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerUpdateListener(() => {
        updateSelectedNode();
      }),
    );
  }, [editor]);

  return selectedNode;
}
