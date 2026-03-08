/**
 * Inline Image Node
 *
 * @description テキストフロー内にインライン配置される画像 DecoratorNode
 * （左/右/全幅フロート対応）
 */

"use client";

import { type ReactElement } from "react";
import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
} from "lexical";
import {
  $create,
  $getState,
  $setState,
  createState,
  DecoratorNode,
} from "lexical";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { parseString, createEnumGuard } from "../config/type-guards";

// =============================================================================
// Types
// =============================================================================

export const INLINE_IMAGE_POSITIONS = ["left", "right", "full"] as const;
export type InlineImagePosition = (typeof INLINE_IMAGE_POSITIONS)[number];

// =============================================================================
// Type Guards
// =============================================================================

const isInlineImagePosition =
  createEnumGuard<InlineImagePosition>(INLINE_IMAGE_POSITIONS);

// =============================================================================
// State
// =============================================================================

export const inlineSrcState = createState("src", {
  parse: parseString,
});

export const inlineAltTextState = createState("altText", {
  parse: parseString,
});

export const inlinePositionState = createState("position", {
  parse: (v: unknown): InlineImagePosition =>
    typeof v === "string" && isInlineImagePosition(v) ? v : "full",
});

export const inlineWidthState = createState("width", {
  parse: (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 200,
});

// =============================================================================
// Component
// =============================================================================

function InlineImageComponent({
  src,
  altText,
  position,
  width,
  nodeKey,
}: {
  src: string;
  altText: string;
  position: InlineImagePosition;
  width: number;
  nodeKey: NodeKey;
}) {
  const [isSelected] = useLexicalNodeSelection(nodeKey);

  const floatStyle: React.CSSProperties =
    position === "left"
      ? { float: "left", marginRight: "1rem", marginBottom: "0.5rem" }
      : position === "right"
        ? { float: "right", marginLeft: "1rem", marginBottom: "0.5rem" }
        : {};

  const containerStyle: React.CSSProperties = {
    display: "inline-block",
    width: position !== "full" ? width : undefined,
    ...floatStyle,
  };

  return (
    <span
      data-lexical-node-key={nodeKey}
      style={containerStyle}
      className={isSelected ? "ring-2 ring-primary rounded" : ""}
    >
      <img
        src={src}
        alt={altText}
        style={{ width: "100%", display: "block" }}
        draggable={false}
      />
    </span>
  );
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertInlineImageElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  if (!element.hasAttribute("data-inline-image")) return null;

  const src = element.getAttribute("data-src") ?? "";
  const altText = element.getAttribute("data-alt") ?? "";
  const positionAttr = element.getAttribute("data-position") ?? "full";
  const position = isInlineImagePosition(positionAttr) ? positionAttr : "full";
  const widthAttr = element.getAttribute("data-width");
  const width = widthAttr ? parseInt(widthAttr, 10) : 200;

  const node = $createInlineImageNode({ src, altText, position, width });
  return { node, after: () => [] };
}

// =============================================================================
// Node Class
// =============================================================================

export class InlineImageNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config("inline-image", {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: inlineSrcState },
        { flat: true, stateConfig: inlineAltTextState },
        { flat: true, stateConfig: inlinePositionState },
        { flat: true, stateConfig: inlineWidthState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      span: (domNode) => {
        if (
          !(domNode instanceof HTMLElement) ||
          !domNode.hasAttribute("data-inline-image")
        ) {
          return null;
        }
        return {
          conversion: $convertInlineImageElement,
          priority: 2,
        };
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const span = document.createElement("span");
    span.setAttribute("data-inline-image", "true");
    span.setAttribute("data-src", $getState(this, inlineSrcState));
    span.setAttribute("data-alt", $getState(this, inlineAltTextState));
    span.setAttribute("data-position", $getState(this, inlinePositionState));
    span.setAttribute(
      "data-width",
      String($getState(this, inlineWidthState)),
    );

    const img = document.createElement("img");
    img.setAttribute("src", $getState(this, inlineSrcState));
    img.setAttribute("alt", $getState(this, inlineAltTextState));
    img.setAttribute("style", "width:100%;display:block;");
    span.appendChild(img);

    return { element: span };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    span.setAttribute("data-inline-image", "true");
    return span;
  }

  override updateDOM(): false {
    return false;
  }

  override isInline(): true {
    return true;
  }

  override decorate(): ReactElement {
    return (
      <InlineImageComponent
        src={$getState(this, inlineSrcState)}
        altText={$getState(this, inlineAltTextState)}
        position={$getState(this, inlinePositionState)}
        width={$getState(this, inlineWidthState)}
        nodeKey={this.getKey()}
      />
    );
  }

}

// =============================================================================
// Factory Functions
// =============================================================================

export function $createInlineImageNode({
  src,
  altText = "",
  position = "full",
  width = 200,
}: {
  src: string;
  altText?: string;
  position?: InlineImagePosition;
  width?: number;
}): InlineImageNode {
  const node = $create(InlineImageNode);
  $setState(node, inlineSrcState, src);
  $setState(node, inlineAltTextState, altText);
  $setState(node, inlinePositionState, position);
  $setState(node, inlineWidthState, width);
  return node;
}

export function $isInlineImageNode(
  node: LexicalNode | null | undefined,
): node is InlineImageNode {
  return node instanceof InlineImageNode;
}
