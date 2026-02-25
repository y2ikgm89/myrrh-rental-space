/**
 * Gallery Node
 *
 * @description 画像ギャラリーを表示するコンポジットノード
 * GalleryContainerNode + GalleryItemNode の2ノード構成
 */

"use client";

import type { DOMConversionMap, EditorConfig } from "lexical";
import {
  $create,
  $getState,
  $getStateChange,
  $setState,
  createState,
  ElementNode,
} from "lexical";
import { parseString } from "../config/type-guards";

// =============================================================================
// Types
// =============================================================================

export type GalleryColumns = 2 | 3 | 4;
export type GalleryStyle = "grid" | "masonry";

// =============================================================================
// GalleryContainerNode States
// =============================================================================

export const galleryColumnsState = createState("columns", {
  parse: (v: unknown): GalleryColumns =>
    v === 2 || v === 3 || v === 4 ? v : 3,
});

export const galleryStyleState = createState("style", {
  parse: (v: unknown): GalleryStyle =>
    v === "grid" || v === "masonry" ? v : "grid",
});

// =============================================================================
// GalleryContainerNode
// =============================================================================

export class GalleryContainerNode extends ElementNode {
  override $config() {
    return this.config("gallery-container", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: galleryColumnsState },
        { flat: true, stateConfig: galleryStyleState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (domNode) => {
        if (
          !(domNode instanceof HTMLElement) ||
          !domNode.hasAttribute("data-gallery")
        )
          return null;
        return {
          conversion: (element) => {
            const cols = Number(element.getAttribute("data-gallery-columns"));
            const style = element.getAttribute("data-gallery-style");
            const node = $createGalleryContainerNode(
              cols === 2 || cols === 3 || cols === 4 ? cols : 3,
            );
            $setState(
              node,
              galleryStyleState,
              style === "masonry" ? "masonry" : "grid",
            );
            return { node };
          },
          priority: 2,
        };
      },
    };
  }

  override isShadowRoot(): boolean {
    return true;
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-gallery", "true");
    div.setAttribute(
      "data-gallery-columns",
      String($getState(this, galleryColumnsState)),
    );
    div.setAttribute("data-gallery-style", $getState(this, galleryStyleState));
    return div;
  }

  override updateDOM(
    prevNode: GalleryContainerNode,
    dom: HTMLElement,
  ): boolean {
    const colsChange = $getStateChange(this, prevNode, galleryColumnsState);
    const styleChange = $getStateChange(this, prevNode, galleryStyleState);
    if (colsChange) {
      const [newCols] = colsChange;
      dom.setAttribute("data-gallery-columns", String(newCols));
    }
    if (styleChange) {
      const [newStyle] = styleChange;
      dom.setAttribute("data-gallery-style", newStyle);
    }
    return false;
  }

  override exportDOM() {
    const div = document.createElement("div");
    div.setAttribute("data-gallery", "true");
    div.setAttribute(
      "data-gallery-columns",
      String($getState(this, galleryColumnsState)),
    );
    div.setAttribute("data-gallery-style", $getState(this, galleryStyleState));
    return { element: div };
  }

  override canInsertTextBefore(): boolean {
    return false;
  }

  override canInsertTextAfter(): boolean {
    return false;
  }
}

// =============================================================================
// GalleryItemNode States
// =============================================================================

export const galleryItemSrcState = createState("src", {
  parse: parseString,
});

export const galleryItemAltState = createState("alt", {
  parse: parseString,
});

export const galleryItemCaptionState = createState("caption", {
  parse: parseString,
});

// =============================================================================
// GalleryItemNode
// =============================================================================

export class GalleryItemNode extends ElementNode {
  override $config() {
    return this.config("gallery-item", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: galleryItemSrcState },
        { flat: true, stateConfig: galleryItemAltState },
        { flat: true, stateConfig: galleryItemCaptionState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      figure: (domNode) => {
        if (
          !(domNode instanceof HTMLElement) ||
          !domNode.hasAttribute("data-gallery-item")
        )
          return null;
        return {
          conversion: (element) => {
            const node = $createGalleryItemNode({
              src: element.getAttribute("data-src") ?? "",
              alt: element.getAttribute("data-alt") ?? "",
              caption: element.getAttribute("data-caption") ?? "",
            });
            return { node, after: () => [] };
          },
          priority: 2,
        };
      },
    };
  }

  override isShadowRoot(): boolean {
    return true;
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const figure = document.createElement("figure");
    figure.setAttribute("data-gallery-item", "true");
    return figure;
  }

  override updateDOM(): boolean {
    return false;
  }

  override exportDOM() {
    const figure = document.createElement("figure");
    figure.setAttribute("data-gallery-item", "true");
    figure.setAttribute("data-src", $getState(this, galleryItemSrcState));
    figure.setAttribute("data-alt", $getState(this, galleryItemAltState));
    figure.setAttribute(
      "data-caption",
      $getState(this, galleryItemCaptionState),
    );
    const img = document.createElement("img");
    img.setAttribute("src", $getState(this, galleryItemSrcState));
    img.setAttribute("alt", $getState(this, galleryItemAltState));
    figure.appendChild(img);
    const caption = $getState(this, galleryItemCaptionState);
    if (caption) {
      const figcaption = document.createElement("figcaption");
      figcaption.textContent = caption;
      figure.appendChild(figcaption);
    }
    return { element: figure };
  }

  override canInsertTextBefore(): boolean {
    return false;
  }

  override canInsertTextAfter(): boolean {
    return false;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function $createGalleryContainerNode(
  columns: GalleryColumns = 3,
): GalleryContainerNode {
  const node = $create(GalleryContainerNode);
  $setState(node, galleryColumnsState, columns);
  $setState(node, galleryStyleState, "grid");
  return node;
}

export function $createGalleryItemNode(
  params: {
    src?: string;
    alt?: string;
    caption?: string;
  } = {},
): GalleryItemNode {
  const node = $create(GalleryItemNode);
  $setState(node, galleryItemSrcState, params.src ?? "");
  $setState(node, galleryItemAltState, params.alt ?? "");
  $setState(node, galleryItemCaptionState, params.caption ?? "");
  return node;
}

export function $isGalleryContainerNode(
  node: unknown,
): node is GalleryContainerNode {
  return node instanceof GalleryContainerNode;
}

export function $isGalleryItemNode(node: unknown): node is GalleryItemNode {
  return node instanceof GalleryItemNode;
}
