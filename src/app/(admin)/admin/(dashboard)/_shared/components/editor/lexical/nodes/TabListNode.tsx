/**
 * TabList Node
 *
 * @description タブのヘッダーリスト
 * TabsContainerNodeの子として使用
 * 子ノード: TabTitleNode×N
 */

"use client";

import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
} from "lexical";
import { $create, ElementNode } from "lexical";

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertTabListElement(
  _element: HTMLElement,
): null | DOMConversionOutput {
  const node = $createTabListNode();
  return { node };
}

// =============================================================================
// Node Class
// =============================================================================

export class TabListNode extends ElementNode {
  override $config() {
    return this.config("tab-list", { extends: ElementNode });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (element.getAttribute("role") === "tablist") {
          return {
            conversion: $convertTabListElement,
            priority: 1,
          };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const element = document.createElement("div");
    element.setAttribute("role", "tablist");

    return { element };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement("div");
    element.setAttribute("role", "tablist");

    return element;
  }

  override updateDOM(): false {
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
// Factory Functions
// =============================================================================

/**
 * TabListノードを作成する
 *
 * @returns TabListNode インスタンス
 */
export function $createTabListNode(): TabListNode {
  return $create(TabListNode);
}

/**
 * ノードがTabListNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns TabListNodeの場合true
 */
export function $isTabListNode(
  node: LexicalNode | null | undefined,
): node is TabListNode {
  return node instanceof TabListNode;
}
