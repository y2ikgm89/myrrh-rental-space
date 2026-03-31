"use client";

/**
 * CustomTableNode
 *
 * @description TableNode を継承し、NodeState API でスタイル・カラー・枠線等を管理するカスタムテーブルノード
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
import { TableNode } from "@lexical/table";
import {
  createEnumGuard,
  parseBoolean,
  parseString,
} from "../config/type-guards";

// =============================================================================
// 型定義
// =============================================================================

export const TABLE_STYLE_VALUES = ["default", "stripes"] as const;
export type TableStyle = (typeof TABLE_STYLE_VALUES)[number];
export const isTableStyle = createEnumGuard<TableStyle>(TABLE_STYLE_VALUES);

// =============================================================================
// Parse ヘルパー
// =============================================================================

function parseTableStyle(v: unknown): TableStyle {
  return typeof v === "string" && isTableStyle(v) ? v : "default";
}

function parseBorderWidth(v: unknown): number {
  const n =
    typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : 1;
}

// =============================================================================
// State 定義
// =============================================================================

export const tableStyleState = createState("tableStyle", {
  parse: parseTableStyle,
});
export const tableHasHeaderState = createState("hasHeader", {
  parse: parseBoolean,
});
export const tableHasFooterState = createState("hasFooter", {
  parse: parseBoolean,
});
export const tableFixedLayoutState = createState("fixedLayout", {
  parse: parseBoolean,
});
export const tableBackgroundColorState = createState("backgroundColor", {
  parse: parseString,
});
export const tableBorderColorState = createState("borderColor", {
  parse: parseString,
});
export const tableBorderWidthState = createState("borderWidth", {
  parse: parseBorderWidth,
});
export const tableHtmlAnchorState = createState("htmlAnchor", {
  parse: parseString,
});
export const tableCssClassState = createState("cssClass", {
  parse: parseString,
});

// =============================================================================
// CustomTableNode
// =============================================================================

export class CustomTableNode extends TableNode {
  override $config() {
    return this.config("custom-table", {
      extends: TableNode,
      stateConfigs: [
        { flat: true, stateConfig: tableStyleState },
        { flat: true, stateConfig: tableHasHeaderState },
        { flat: true, stateConfig: tableHasFooterState },
        { flat: true, stateConfig: tableFixedLayoutState },
        { flat: true, stateConfig: tableBackgroundColorState },
        { flat: true, stateConfig: tableBorderColorState },
        { flat: true, stateConfig: tableBorderWidthState },
        { flat: true, stateConfig: tableHtmlAnchorState },
        { flat: true, stateConfig: tableCssClassState },
      ],
    });
  }

  override createDOM(
    config: EditorConfig,
    editor?: LexicalEditor,
  ): HTMLElement {
    const dom = super.createDOM(config, editor);
    this._applyAttributes(dom);
    return dom;
  }

  override updateDOM(
    prevNode: this,
    dom: HTMLElement,
    config: EditorConfig,
  ): boolean {
    if (super.updateDOM(prevNode, dom, config)) {
      return true;
    }
    this._applyAttributes(dom);
    return false;
  }

  _applyAttributes(dom: HTMLElement): void {
    const style = $getState(this, tableStyleState);
    const fixedLayout = $getState(this, tableFixedLayoutState);
    const backgroundColor = $getState(this, tableBackgroundColorState);
    const borderColor = $getState(this, tableBorderColorState);
    const borderWidth = $getState(this, tableBorderWidthState);
    const htmlAnchor = $getState(this, tableHtmlAnchorState);
    const cssClass = $getState(this, tableCssClassState);

    // スタイルプリセット
    dom.dataset["tableStyle"] = style;

    // セル幅均等
    if (fixedLayout) {
      dom.style.tableLayout = "fixed";
      dom.style.width = "100%";
    } else {
      dom.style.removeProperty("table-layout");
      dom.style.removeProperty("width");
    }

    // 背景色
    dom.style.backgroundColor = backgroundColor;

    // 枠線
    if (borderColor && borderWidth > 0) {
      dom.style.setProperty("--table-border-color", borderColor);
      dom.style.setProperty("--table-border-width", `${borderWidth}px`);
    } else {
      dom.style.removeProperty("--table-border-color");
      dom.style.removeProperty("--table-border-width");
    }

    // HTML アンカー
    if (htmlAnchor) {
      dom.id = htmlAnchor;
    } else {
      dom.removeAttribute("id");
    }

    // CSS クラス（前回値と差分で追加/削除）
    const prev = dom.dataset["cssClass"] ?? "";
    prev
      .split(" ")
      .filter(Boolean)
      .forEach((c) => dom.classList.remove(c));
    if (cssClass) {
      cssClass
        .split(" ")
        .filter(Boolean)
        .forEach((c) => dom.classList.add(c));
    }
    dom.dataset["cssClass"] = cssClass;
  }

  override exportDOM(editor: LexicalEditor): DOMExportOutput {
    const result = super.exportDOM(editor);
    if (result.element instanceof HTMLElement) {
      this._applyAttributes(result.element);
    }
    return result;
  }

  static override importDOM(): DOMConversionMap | null {
    return TableNode.importDOM();
  }
}

// =============================================================================
// ファクトリ関数
// =============================================================================

export function $createCustomTableNode(): CustomTableNode {
  const node = $create(CustomTableNode);
  $setState(node, tableStyleState, "default");
  $setState(node, tableHasHeaderState, true);
  $setState(node, tableHasFooterState, false);
  // false: テーブル幅はコンテンツに追従 (table-layout: auto)
  // true にすると width: 100% + table-layout: fixed に切り替わる
  $setState(node, tableFixedLayoutState, false);
  $setState(node, tableBackgroundColorState, "");
  $setState(node, tableBorderColorState, "");
  $setState(node, tableBorderWidthState, 1);
  $setState(node, tableHtmlAnchorState, "");
  $setState(node, tableCssClassState, "");
  return node;
}

export function $isCustomTableNode(
  node: LexicalNode | null | undefined,
): node is CustomTableNode {
  return node instanceof CustomTableNode;
}
