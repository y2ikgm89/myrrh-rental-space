/**
 * Collapsible Container Node
 *
 * @description 折りたたみグループの親コンテナを表すElementNode
 * 子ノード: CollapsibleItemNode (1〜10個)
 *
 * スタイルは lexical-content.css の [data-collapsible-container] セレクターで管理
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
  $isElementNode,
  $createParagraphNode,
} from "lexical";
import { createEnumGuard } from "../config/type-guards";
import { isAccentColor, type AccentColor } from "../config/accent-colors";
import { $isCollapsibleItemNode } from "./CollapsibleItemNode";

// =============================================================================
// Types
// =============================================================================

export type CollapsibleStyle = "default" | "minimal" | "card" | "filled";

export const COLLAPSIBLE_STYLES: readonly CollapsibleStyle[] = [
  "default",
  "minimal",
  "card",
  "filled",
] as const;

// =============================================================================
// Type Guards
// =============================================================================

export const isCollapsibleStyle =
  createEnumGuard<CollapsibleStyle>(COLLAPSIBLE_STYLES);

// =============================================================================
// State
// =============================================================================

export const collapsibleStyleState = createState("collapsibleStyle", {
  parse: (v: unknown): CollapsibleStyle =>
    typeof v === "string" && isCollapsibleStyle(v) ? v : "default",
});

export const collapsibleColorState = createState("collapsibleColor", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertCollapsibleContainerElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const rawStyle = element.getAttribute("data-collapsible-style");
  const style = rawStyle && isCollapsibleStyle(rawStyle) ? rawStyle : "default";
  const colorAttr = element.getAttribute("data-color");
  const color: AccentColor =
    colorAttr && isAccentColor(colorAttr) ? colorAttr : "default";

  const node = $createCollapsibleContainerNode(style, color);
  return { node };
}

// =============================================================================
// Node Class
// =============================================================================

export class CollapsibleContainerNode extends ElementNode {
  override $config() {
    return this.config("collapsible-container", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: collapsibleStyleState },
        { flat: true, stateConfig: collapsibleColorState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (element.hasAttribute("data-collapsible-container")) {
          return {
            conversion: $convertCollapsibleContainerElement,
            priority: 1,
          };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const style = $getState(this, collapsibleStyleState);
    const color = $getState(this, collapsibleColorState);
    const element = document.createElement("div");
    element.setAttribute("data-collapsible-container", "true");
    element.setAttribute("data-collapsible-style", style);
    element.setAttribute("data-color", color);
    return { element };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const style = $getState(this, collapsibleStyleState);
    const color = $getState(this, collapsibleColorState);
    const element = document.createElement("div");
    element.setAttribute("data-collapsible-container", "true");
    element.setAttribute("data-collapsible-style", style);
    element.setAttribute("data-color", color);
    return element;
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    const styleChange = $getStateChange(this, prevNode, collapsibleStyleState);
    if (styleChange !== null) {
      const [newStyle] = styleChange;
      dom.setAttribute("data-collapsible-style", newStyle);
    }
    const colorChange = $getStateChange(this, prevNode, collapsibleColorState);
    if (colorChange !== null) {
      const [newColor] = colorChange;
      dom.setAttribute("data-color", newColor);
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

  override collapseAtStart(): boolean {
    const children = this.getChildren();
    const paragraph = $createParagraphNode();

    // 3-tier: Container → Item → Title/Content
    // Flatten first item's first child's children into a paragraph
    for (const child of children) {
      if ($isCollapsibleItemNode(child)) {
        const itemChildren = child.getChildren();
        for (const itemChild of itemChildren) {
          if ($isElementNode(itemChild)) {
            const grandchildren = itemChild.getChildren();
            for (const grandchild of grandchildren) {
              paragraph.append(grandchild);
            }
          }
        }
        break; // Only first item
      }
    }

    this.replace(paragraph);
    return true;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function $createCollapsibleContainerNode(
  style: CollapsibleStyle = "default",
  color: AccentColor = "default",
): CollapsibleContainerNode {
  const node = $create(CollapsibleContainerNode);
  $setState(node, collapsibleStyleState, style);
  $setState(node, collapsibleColorState, color);
  return node;
}

export function $isCollapsibleContainerNode(
  node: LexicalNode | null | undefined,
): node is CollapsibleContainerNode {
  return node instanceof CollapsibleContainerNode;
}
