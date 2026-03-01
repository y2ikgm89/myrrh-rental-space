/**
 * CustomTableCellNode
 *
 * @description TableCellNode を継承し、セル背景色を NodeState API で管理するカスタムテーブルセルノード
 */

import {
  $create,
  $getState,
  $setState,
  type DOMConversionMap,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  createState,
} from "lexical";
import { TableCellNode, TableCellHeaderStates } from "@lexical/table";
import { parseString } from "../config/type-guards";

// @lexical/table index.d.ts から型が再エクスポートされていないため、ローカルで定義
type TableCellHeaderState =
  (typeof TableCellHeaderStates)[keyof typeof TableCellHeaderStates];

// =============================================================================
// State 定義
// =============================================================================

export const cellBackgroundColorState = createState("cellBg", {
  parse: parseString,
});

// =============================================================================
// CustomTableCellNode
// =============================================================================

export class CustomTableCellNode extends TableCellNode {
  override $config() {
    return this.config("custom-tablecell", {
      extends: TableCellNode,
      stateConfigs: [{ flat: true, stateConfig: cellBackgroundColorState }],
    });
  }

  override createDOM(config: EditorConfig): HTMLTableCellElement {
    const dom = super.createDOM(config);
    const bg = $getState(this, cellBackgroundColorState);
    if (bg) {
      dom.style.backgroundColor = bg;
    }
    return dom;
  }

  // TableCellNode.updateDOM は (prevNode: this): boolean シグネチャ（1引数のみ）
  // 背景色変更時に true を返して DOM 再構築（createDOM）をトリガーする
  override updateDOM(prevNode: this): boolean {
    if (super.updateDOM(prevNode)) {
      return true;
    }
    const prevBg = $getState(prevNode, cellBackgroundColorState);
    const nextBg = $getState(this, cellBackgroundColorState);
    return prevBg !== nextBg;
  }

  override exportDOM(editor: LexicalEditor): DOMExportOutput {
    const result = super.exportDOM(editor);
    if (result.element instanceof HTMLElement) {
      const bg = $getState(this, cellBackgroundColorState);
      if (bg) {
        result.element.style.backgroundColor = bg;
      }
    }
    return result;
  }

  static override importDOM(): DOMConversionMap | null {
    return TableCellNode.importDOM();
  }
}

// =============================================================================
// ファクトリ関数
// =============================================================================

export function $createCustomTableCellNode(
  headerState: TableCellHeaderState = TableCellHeaderStates.NO_STATUS,
  colSpan = 1,
  width?: number,
): CustomTableCellNode {
  const node = $create(CustomTableCellNode);
  $setState(node, cellBackgroundColorState, "");
  // TableCellNode の既存フィールドをセッターで初期化
  if (headerState !== TableCellHeaderStates.NO_STATUS) {
    node.setHeaderStyles(headerState);
  }
  if (colSpan !== 1) node.setColSpan(colSpan);
  if (width !== undefined) node.setWidth(width);
  return node;
}

export function $isCustomTableCellNode(
  node: LexicalNode | null | undefined,
): node is CustomTableCellNode {
  return node instanceof CustomTableCellNode;
}
