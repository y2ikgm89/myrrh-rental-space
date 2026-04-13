/**
 * TabTitle Node
 *
 * @description 各タブのタイトル（ボタン）
 * TabListNodeの子として使用
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
import { parseBoolean } from "../config/type-guards";

// =============================================================================
// State
// =============================================================================

export const tabTitleIndexState = createState("tabIndex", {
  parse: (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? v : 0,
});

export const tabTitleActiveState = createState("isActive", {
  parse: parseBoolean,
});

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertTabTitleElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const indexAttr = element.getAttribute("data-tab-index");
  const tabIndex = indexAttr ? parseInt(indexAttr, 10) : 0;
  const isActive = element.getAttribute("aria-selected") === "true";
  const node = $createTabTitleNode(tabIndex, isActive);
  return { node };
}

// =============================================================================
// Node Class
// =============================================================================

export class TabTitleNode extends ElementNode {
  override $config() {
    return this.config("tab-title", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: tabTitleIndexState },
        { flat: true, stateConfig: tabTitleActiveState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      button: (element: HTMLElement) => {
        if (element.getAttribute("role") === "tab") {
          return {
            conversion: $convertTabTitleElement,
            priority: 1,
          };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const tabIndex = $getState(this, tabTitleIndexState);
    const isActive = $getState(this, tabTitleActiveState);
    const element = document.createElement("button");
    element.setAttribute("role", "tab");
    element.setAttribute("data-tab-index", String(tabIndex));
    element.setAttribute("aria-selected", String(isActive));
    return { element };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const tabIndex = $getState(this, tabTitleIndexState);
    const isActive = $getState(this, tabTitleActiveState);
    const element = document.createElement("div");
    element.setAttribute("role", "tab");
    element.setAttribute("data-tab-index", String(tabIndex));
    element.setAttribute("aria-selected", String(isActive));
    return element;
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    const indexChange = $getStateChange(this, prevNode, tabTitleIndexState);
    if (indexChange !== null) {
      const [newIndex] = indexChange;
      dom.setAttribute("data-tab-index", String(newIndex));
    }
    const activeChange = $getStateChange(this, prevNode, tabTitleActiveState);
    if (activeChange !== null) {
      const [newIsActive] = activeChange;
      dom.setAttribute("aria-selected", String(newIsActive));
    }
    return false;
  }

  override isShadowRoot(): boolean {
    return true;
  }

  override canInsertTextBefore(): false {
    return false;
  }

  override canInsertTextAfter(): false {
    return false;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * TabTitleノードを作成する
 *
 * @param tabIndex - タブのインデックス
 * @param isActive - アクティブ状態
 * @returns TabTitleNode インスタンス
 */
export function $createTabTitleNode(
  tabIndex: number = 0,
  isActive: boolean = false,
): TabTitleNode {
  const node = $create(TabTitleNode);
  $setState(node, tabTitleIndexState, tabIndex);
  $setState(node, tabTitleActiveState, isActive);
  return node;
}

/**
 * ノードがTabTitleNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns TabTitleNodeの場合true
 */
export function $isTabTitleNode(
  node: LexicalNode | null | undefined,
): node is TabTitleNode {
  return node instanceof TabTitleNode;
}
