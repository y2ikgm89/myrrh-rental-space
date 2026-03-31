/**
 * IconLayout Container Node
 *
 * @description CSS Grid のカラムレイアウト（Lexical Playground の layout-container を拡張）
 *
 * - **広い画面**: インライン `grid-template-columns`（Playground と同じ取り込み条件）
 * - **狭い画面**: CSS 変数 `--lexical-layout-mobile`（`lexical-content.css` の max-width メディアクエリ）
 * - NodeState で `templateColumns` / `templateColumnsNarrow` を保持
 */

"use client";

import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
} from "lexical";
import {
  $create,
  $getState,
  $getStateChange,
  $setState,
  createState,
  ElementNode,
} from "lexical";

/** 狭いビューポート用カスタムプロパティ名（公開 HTML とエディタ共通） */
export const LAYOUT_MOBILE_COLUMNS_VAR = "--lexical-layout-mobile";

// =============================================================================
// State
// =============================================================================

export const templateColumnsState = createState("templateColumns", {
  parse: (v: unknown): string =>
    typeof v === "string" && v.length > 0 ? v : "1fr 1fr",
});

export const templateColumnsNarrowState = createState("templateColumnsNarrow", {
  parse: (v: unknown): string =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : "1fr",
});

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertLayoutContainerElement(
  element: HTMLElement,
): DOMConversionOutput | null {
  const templateColumns = element.style.gridTemplateColumns;
  if (!templateColumns) {
    return null;
  }
  const narrowRaw = element.style.getPropertyValue(LAYOUT_MOBILE_COLUMNS_VAR);
  const templateColumnsNarrow =
    narrowRaw.trim().length > 0 ? narrowRaw.trim() : "1fr";
  const node = $createLayoutContainerNode(
    templateColumns,
    templateColumnsNarrow,
  );
  return { node };
}

// =============================================================================
// Node
// =============================================================================

export class LayoutContainerNode extends ElementNode {
  override $config() {
    return this.config("layout-container", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: templateColumnsState },
        { flat: true, stateConfig: templateColumnsNarrowState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (!element.hasAttribute("data-lexical-layout-container")) {
          return null;
        }
        return {
          conversion: $convertLayoutContainerElement,
          priority: 2,
        };
      },
    };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const templateColumns = $getState(this, templateColumnsState);
    const templateColumnsNarrow = $getState(this, templateColumnsNarrowState);
    const dom = document.createElement("div");
    dom.setAttribute("data-lexical-layout-container", "true");
    dom.style.gridTemplateColumns = templateColumns;
    dom.style.setProperty(LAYOUT_MOBILE_COLUMNS_VAR, templateColumnsNarrow);
    return dom;
  }

  override exportDOM(): DOMExportOutput {
    const templateColumns = $getState(this, templateColumnsState);
    const templateColumnsNarrow = $getState(this, templateColumnsNarrowState);
    const element = document.createElement("div");
    element.setAttribute("data-lexical-layout-container", "true");
    element.style.gridTemplateColumns = templateColumns;
    element.style.setProperty(LAYOUT_MOBILE_COLUMNS_VAR, templateColumnsNarrow);
    return { element };
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    const wideChange = $getStateChange(this, prevNode, templateColumnsState);
    if (wideChange !== null) {
      const [next] = wideChange;
      dom.style.gridTemplateColumns = next;
    }
    const narrowChange = $getStateChange(
      this,
      prevNode,
      templateColumnsNarrowState,
    );
    if (narrowChange !== null) {
      const [nextNarrow] = narrowChange;
      dom.style.setProperty(LAYOUT_MOBILE_COLUMNS_VAR, nextNarrow);
    }
    return false;
  }

  override isShadowRoot(): boolean {
    return true;
  }

  override canBeEmpty(): false {
    return false;
  }

  override canInsertTextBefore(): false {
    return false;
  }

  override canInsertTextAfter(): false {
    return false;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

export function $createLayoutContainerNode(
  templateColumns: string = "1fr 1fr",
  templateColumnsNarrow: string = "1fr",
): LayoutContainerNode {
  const node = $create(LayoutContainerNode);
  $setState(node, templateColumnsState, templateColumns);
  $setState(node, templateColumnsNarrowState, templateColumnsNarrow);
  return node;
}

export function $isLayoutContainerNode(
  node: LexicalNode | null | undefined,
): node is LayoutContainerNode {
  return node instanceof LayoutContainerNode;
}
