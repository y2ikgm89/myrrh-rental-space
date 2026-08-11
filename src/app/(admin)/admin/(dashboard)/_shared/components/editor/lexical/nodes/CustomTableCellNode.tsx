/**
 * CustomTableCellNode
 *
 * @description TableCellNode を継承し、セル背景色を NodeState API で管理するカスタムテーブルセルノード
 */

import {
  $create,
  $getState,
  $getStateChange,
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
  // dom 引数がないため $getStateChange で変更検出し、変更時は true を返して createDOM で再構築
  override updateDOM(prevNode: this): boolean {
    if (super.updateDOM(prevNode)) {
      return true;
    }
    return $getStateChange(this, prevNode, cellBackgroundColorState) !== null;
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

  // 基底 TableCellNode.importDOM() が返す converter を wrap し、生成された node が
  // CustomTableCellNode であれば `element.style.backgroundColor` を読んで
  // cellBackgroundColorState を復元する。CustomHeadingNode.importDOM() と同一パターン。
  static override importDOM(): DOMConversionMap | null {
    // 親の converter の取得元が `TableCellNode.importDOM()` ではなく $config() な理由は
    // CustomHeadingNode.importDOM() の同項コメントを参照（0.49 の $config() 移行で、
    // 静的 importDOM は登録時に生やされる遅延生成になった）。
    // $config() の戻り型は converter を literal（0 引数）として推論するため、
    // DOMConversionMap（= 引数付きの契約型）で受け直す。
    const base: DOMConversionMap | undefined =
      TableCellNode.prototype.$config().tablecell?.importDOM;
    if (!base) return null;

    const result: DOMConversionMap = {};
    for (const [tag, converter] of Object.entries(base)) {
      if (!converter) continue;
      result[tag] = (node: HTMLElement) => {
        const output = converter(node);
        if (!output) return null;
        const originalConversion = output.conversion;
        return {
          ...output,
          // Node Replacement (config/nodes.ts の `{replace: TableCellNode, withKlass:
          // CustomTableCellNode}`) により、editor は raw TableCellNode.importDOM()
          // （このラップを経由しない無印の base 変換、priority 0）も 'tablecell' type
          // として td/th に別途登録する。同一 priority の場合 Lexical の tie-break は
          // 「EDITOR_NODES 配列内で後に登録された方が勝つ」ため、登録順次第でこのラップ
          // (cellBackgroundColorState 復元) が silently 無効化されるリスクがある。
          // priority を明示的に base (0) より1段階高くし、登録順に依存せず常に本ラップが
          // 選ばれるようにする。
          priority: 1,
          conversion: (element: HTMLElement) => {
            const converted = originalConversion(element);
            if (!converted) return null;
            const { node: convertedNode } = converted;
            if (convertedNode instanceof CustomTableCellNode) {
              const bg = element.style.backgroundColor;
              if (bg) {
                $setState(convertedNode, cellBackgroundColorState, bg);
              }
            }
            return converted;
          },
        };
      };
    }
    return result;
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
