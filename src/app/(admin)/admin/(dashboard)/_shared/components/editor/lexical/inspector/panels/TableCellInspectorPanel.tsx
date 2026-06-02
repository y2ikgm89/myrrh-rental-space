/**
 * Table Cell Inspector Panel
 *
 * @description CustomTableCellNode のプロパティ編集パネル
 * セル背景色の設定を提供する
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { TableColorPicker } from "../components/TableColorPicker";
import { useNodeUpdater } from "../hooks/use-node-updater";
import {
  $isCustomTableCellNode,
  cellBackgroundColorState,
  type CustomTableCellNode,
} from "../../nodes/CustomTableCellNode";
import type { NodeKey } from "lexical";

// =============================================================================
// Types
// =============================================================================

type TableCellInspectorPanelProps = {
  nodeKey: NodeKey;
  node: CustomTableCellNode;
};

// =============================================================================
// Component
// =============================================================================

export function TableCellInspectorPanel({
  nodeKey,
  node,
}: TableCellInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isCustomTableCellNode);

  const backgroundColor = editor.read(() =>
    $getState(node, cellBackgroundColorState),
  );

  return (
    <div>
      <InspectorHeader title="テーブルセル" />

      <InspectorSection title="カラー">
        <TableColorPicker
          label="セル背景色"
          value={backgroundColor}
          onChange={(v) =>
            updateNode((n) => {
              $setState(n, cellBackgroundColorState, v);
            })
          }
        />
      </InspectorSection>
    </div>
  );
}
