/**
 * Collapsible Content Node
 *
 * @description 折りたたみのコンテンツ部分を表すElementNode
 *
 * スタイルは lexical-content.css の [data-collapsible-content] セレクターで管理
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

function $convertCollapsibleContentElement(
  _element: HTMLElement,
): null | DOMConversionOutput {
  const node = $createCollapsibleContentNode();
  return { node };
}

// =============================================================================
// Node Class
// =============================================================================

export class CollapsibleContentNode extends ElementNode {
  override $config() {
    return this.config("collapsible-content", { extends: ElementNode });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (element.hasAttribute("data-collapsible-content")) {
          return {
            conversion: $convertCollapsibleContentElement,
            priority: 1,
          };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const element = document.createElement("div");
    element.setAttribute("data-collapsible-content", "true");
    return { element };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement("div");
    element.setAttribute("data-collapsible-content", "true");
    return element;
  }

  override updateDOM(): false {
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

export function $createCollapsibleContentNode(): CollapsibleContentNode {
  return $create(CollapsibleContentNode);
}

export function $isCollapsibleContentNode(
  node: LexicalNode | null | undefined,
): node is CollapsibleContentNode {
  return node instanceof CollapsibleContentNode;
}
