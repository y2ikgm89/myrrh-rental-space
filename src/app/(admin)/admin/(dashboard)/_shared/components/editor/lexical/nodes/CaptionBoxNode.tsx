/**
 * CaptionBox Node
 *
 * @description キャプションボックス — タイトル付きハイライトボックス
 * 3-node composite: CaptionBoxNode (container) → CaptionBoxTitleNode + CaptionBoxContentNode
 *
 * スタイルは lexical-content.css の [data-caption-box] セレクターで管理
 */

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
import { createEnumGuard } from "../config/type-guards";

// =============================================================================
// State
// =============================================================================

export const captionBoxColorState = createState("color", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});

export type CaptionBoxStyle = "filled" | "compact" | "band" | "inner" | "plain";

export const CAPTION_BOX_STYLES: readonly CaptionBoxStyle[] = [
  "filled",
  "compact",
  "band",
  "inner",
  "plain",
] as const;

export const isCaptionBoxStyle =
  createEnumGuard<CaptionBoxStyle>(CAPTION_BOX_STYLES);

export const captionBoxStyleState = createState("captionBoxStyle", {
  parse: (v: unknown): CaptionBoxStyle =>
    typeof v === "string" && isCaptionBoxStyle(v) ? v : "filled",
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
  const styleAttr = element.getAttribute("data-caption-box-style");
  const style: CaptionBoxStyle =
    styleAttr && isCaptionBoxStyle(styleAttr) ? styleAttr : "filled";
  const node = $createCaptionBoxNode(color, style);
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
      stateConfigs: [
        { flat: true, stateConfig: captionBoxColorState },
        { flat: true, stateConfig: captionBoxStyleState },
      ],
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
    const style = $getState(this, captionBoxStyleState);
    if (style !== "filled")
      element.setAttribute("data-caption-box-style", style);
    return { element };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement("div");
    element.setAttribute("data-caption-box", "true");
    const color = $getState(this, captionBoxColorState);
    if (color !== "default") element.setAttribute("data-color", color);
    const style = $getState(this, captionBoxStyleState);
    if (style !== "filled")
      element.setAttribute("data-caption-box-style", style);
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
    const styleChange = $getStateChange(this, prevNode, captionBoxStyleState);
    if (styleChange !== null) {
      const [newStyle] = styleChange;
      if (newStyle === "filled") {
        dom.removeAttribute("data-caption-box-style");
      } else {
        dom.setAttribute("data-caption-box-style", newStyle);
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
  style: CaptionBoxStyle = "filled",
): CaptionBoxNode {
  const node = $setState($create(CaptionBoxNode), captionBoxColorState, color);
  $setState(node, captionBoxStyleState, style);
  return node;
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
