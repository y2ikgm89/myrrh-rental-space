/**
 * CaptionBox Node
 *
 * @description キャプションボックス — タイトル付きハイライトボックス
 * 3-node composite: CaptionBoxNode (container) → CaptionBoxTitleNode + CaptionBoxContentNode
 *
 * スタイルは lexical-content.css の [data-caption-box] セレクターで管理
 */

"use client";

import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  RangeSelection,
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
import { isAccentColor, type AccentColor } from "../config/accent-colors";

// =============================================================================
// State
// =============================================================================

export const captionBoxColorState = createState("color", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertCaptionBoxElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const colorAttr = element.getAttribute("data-color");
  const color: AccentColor =
    colorAttr && isAccentColor(colorAttr) ? colorAttr : "default";
  const node = $createCaptionBoxNode(color);
  return { node };
}

function $convertCaptionBoxTitleElement(
  _element: HTMLElement,
): null | DOMConversionOutput {
  const node = $createCaptionBoxTitleNode();
  return { node };
}

function $convertCaptionBoxContentElement(
  _element: HTMLElement,
): null | DOMConversionOutput {
  const node = $createCaptionBoxContentNode();
  return { node };
}

// =============================================================================
// CaptionBoxNode (Container)
// =============================================================================

export class CaptionBoxNode extends ElementNode {
  override $config() {
    return this.config("caption-box", {
      extends: ElementNode,
      stateConfigs: [{ flat: true, stateConfig: captionBoxColorState }],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (element.hasAttribute("data-caption-box")) {
          return {
            conversion: $convertCaptionBoxElement,
            priority: 2,
          };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const element = document.createElement("div");
    element.setAttribute("data-caption-box", "true");
    const color = $getState(this, captionBoxColorState);
    if (color !== "default") element.setAttribute("data-color", color);
    return { element };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement("div");
    element.setAttribute("data-caption-box", "true");
    const color = $getState(this, captionBoxColorState);
    if (color !== "default") element.setAttribute("data-color", color);
    return element;
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    const colorChange = $getStateChange(this, prevNode, captionBoxColorState);
    if (colorChange !== null) {
      const [newColor] = colorChange;
      if (newColor === "default") {
        dom.removeAttribute("data-color");
      } else {
        dom.setAttribute("data-color", newColor);
      }
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

    // Flatten first child's children into a paragraph
    for (const child of children) {
      if ($isElementNode(child)) {
        const grandchildren = child.getChildren();
        for (const grandchild of grandchildren) {
          paragraph.append(grandchild);
        }
        break; // Only first child
      }
    }

    this.replace(paragraph);
    return true;
  }
}

// =============================================================================
// CaptionBoxTitleNode
// =============================================================================

export class CaptionBoxTitleNode extends ElementNode {
  override $config() {
    return this.config("caption-box-title", { extends: ElementNode });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (element.hasAttribute("data-caption-box-title")) {
          return {
            conversion: $convertCaptionBoxTitleElement,
            priority: 2,
          };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const element = document.createElement("div");
    element.setAttribute("data-caption-box-title", "true");
    return { element };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement("div");
    element.setAttribute("data-caption-box-title", "true");
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

  override insertNewAfter(
    _selection: RangeSelection,
    restoreSelection = true,
  ): null | ElementNode {
    const container = this.getParent();
    if ($isCaptionBoxNode(container)) {
      const content = container.getChildren().find($isCaptionBoxContentNode);
      if (content) {
        const firstChild = content.getFirstChild();
        if (firstChild) {
          if (restoreSelection) {
            firstChild.selectStart();
          }
          return null;
        }
      }
    }
    return null;
  }
}

// =============================================================================
// CaptionBoxContentNode
// =============================================================================

export class CaptionBoxContentNode extends ElementNode {
  override $config() {
    return this.config("caption-box-content", { extends: ElementNode });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (element.hasAttribute("data-caption-box-content")) {
          return {
            conversion: $convertCaptionBoxContentElement,
            priority: 2,
          };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const element = document.createElement("div");
    element.setAttribute("data-caption-box-content", "true");
    return { element };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement("div");
    element.setAttribute("data-caption-box-content", "true");
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

export function $createCaptionBoxNode(
  color: AccentColor = "default",
): CaptionBoxNode {
  return $setState($create(CaptionBoxNode), captionBoxColorState, color);
}

export function $createCaptionBoxTitleNode(): CaptionBoxTitleNode {
  return $create(CaptionBoxTitleNode);
}

export function $createCaptionBoxContentNode(): CaptionBoxContentNode {
  return $create(CaptionBoxContentNode);
}

// =============================================================================
// Type Guards
// =============================================================================

export function $isCaptionBoxNode(
  node: LexicalNode | null | undefined,
): node is CaptionBoxNode {
  return node instanceof CaptionBoxNode;
}

export function $isCaptionBoxTitleNode(
  node: LexicalNode | null | undefined,
): node is CaptionBoxTitleNode {
  return node instanceof CaptionBoxTitleNode;
}

export function $isCaptionBoxContentNode(
  node: LexicalNode | null | undefined,
): node is CaptionBoxContentNode {
  return node instanceof CaptionBoxContentNode;
}
