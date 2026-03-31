/**
 * IconLayout Item Node
 *
 * @description レイアウトコンテナ内の 1 カラム（Lexical Playground の layout-item と同型）
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
  $createParagraphNode,
  $isParagraphNode,
  ElementNode,
} from "lexical";
import { $isLayoutContainerNode } from "./LayoutContainerNode";

// =============================================================================
// Type Guard (declared early for use in class)
// =============================================================================

export function $isLayoutItemNode(
  node: LexicalNode | null | undefined,
): node is LayoutItemNode {
  return node instanceof LayoutItemNode;
}

/**
 * Playground の $isEmptyLayoutItemNode と同様。空カラムは通常「空段落 1 つのみ」。
 */
export function $isEmptyLayoutItemNode(node: LexicalNode): boolean {
  if (!$isLayoutItemNode(node) || node.getChildrenSize() !== 1) {
    return false;
  }
  const firstChild = node.getFirstChild();
  return (
    firstChild !== null && $isParagraphNode(firstChild) && firstChild.isEmpty()
  );
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertLayoutItemElement(): DOMConversionOutput | null {
  const node = $createLayoutItemNode();
  return { node };
}

// =============================================================================
// Node
// =============================================================================

export class LayoutItemNode extends ElementNode {
  override $config() {
    return this.config("layout-item", { extends: ElementNode });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (!element.hasAttribute("data-lexical-layout-item")) {
          return null;
        }
        return {
          conversion: $convertLayoutItemElement,
          priority: 2,
        };
      },
    };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const dom = document.createElement("div");
    dom.setAttribute("data-lexical-layout-item", "true");
    return dom;
  }

  override exportDOM(): DOMExportOutput {
    const element = document.createElement("div");
    element.setAttribute("data-lexical-layout-item", "true");
    return { element };
  }

  override updateDOM(): false {
    return false;
  }

  // レイアウトアイテムは選択境界として機能
  override isShadowRoot(): boolean {
    return true;
  }

  // テキストの漏れ防止
  override canInsertTextBefore(): false {
    return false;
  }

  override canInsertTextAfter(): false {
    return false;
  }

  // 先頭でBackspace時の挙動
  override collapseAtStart(): boolean {
    const parent = this.getParent();
    if (!$isLayoutContainerNode(parent)) {
      return false;
    }

    const siblings = parent.getChildren();
    const isFirst = siblings[0] === this;
    const allEmpty = siblings.every(
      (sibling) =>
        $isLayoutItemNode(sibling) && $isEmptyLayoutItemNode(sibling),
    );

    if (isFirst && allEmpty) {
      // 全カラムが空（空段落のみ）ならコンテナを 1 段落に置換（Playground は remove のみ）
      const paragraph = $createParagraphNode();
      parent.replace(paragraph);
      paragraph.select();
      return true;
    }

    return false;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

export function $createLayoutItemNode(): LayoutItemNode {
  return $create(LayoutItemNode);
}
