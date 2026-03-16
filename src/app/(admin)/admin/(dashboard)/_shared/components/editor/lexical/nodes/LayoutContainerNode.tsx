/**
 * Layout Container Node
 *
 * @description CSSグリッドベースのカラムレイアウトコンテナ
 *
 * 公式Playgroundパターンに準拠
 * - ElementNodeを拡張
 * - templateColumnsでグリッド列を定義
 * - isShadowRoot()でネスト境界を形成
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

// =============================================================================
// State
// =============================================================================

export const templateColumnsState = createState("templateColumns", {
  parse: (v: unknown): string =>
    typeof v === "string" && v.length > 0 ? v : "1fr 1fr",
});

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertLayoutContainerElement(
  element: HTMLElement,
): DOMConversionOutput | null {
  const templateColumns =
    element.style.gridTemplateColumns ||
    element.dataset["layoutTemplate"] ||
    "1fr 1fr";
  const node = $createLayoutContainerNode(templateColumns);
  return { node };
}

// =============================================================================
// Node
// =============================================================================

export class LayoutContainerNode extends ElementNode {
  override $config() {
    return this.config("layout-container", {
      extends: ElementNode,
      stateConfigs: [{ flat: true, stateConfig: templateColumnsState }],
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
    const dom = document.createElement("div");
    dom.setAttribute("data-lexical-layout-container", "true");
    dom.style.gridTemplateColumns = templateColumns;
    return dom;
  }

  override exportDOM(): DOMExportOutput {
    const templateColumns = $getState(this, templateColumnsState);
    const element = document.createElement("div");
    element.setAttribute("data-lexical-layout-container", "true");
    element.setAttribute("data-layout-template", templateColumns);
    element.style.gridTemplateColumns = templateColumns;
    return { element };
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    const change = $getStateChange(this, prevNode, templateColumnsState);
    if (change !== null) {
      const [newColumns] = change;
      dom.style.gridTemplateColumns = newColumns;
    }
    return false;
  }

  // レイアウトコンテナは選択境界として機能
  override isShadowRoot(): boolean {
    return true;
  }

  // 空のコンテナを許可しない
  override canBeEmpty(): false {
    return false;
  }

  // テキストの漏れ防止
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
): LayoutContainerNode {
  return $setState(
    $create(LayoutContainerNode),
    templateColumnsState,
    templateColumns,
  );
}

export function $isLayoutContainerNode(
  node: LexicalNode | null | undefined,
): node is LayoutContainerNode {
  return node instanceof LayoutContainerNode;
}
