/**
 * Inline Image Node
 *
 * @description テキストフロー内にインライン配置される画像 DecoratorNode
 * （左/右/全幅フロート対応）
 * server / headless でも import 可能。編集 UI は InlineImageNode.decorator.client。
 */

import type { ReactElement } from "react";
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
  $setState,
  createState,
  DecoratorNode,
} from "lexical";
import { parseString, createEnumGuard } from "../config/type-guards";
import { renderLexicalDecorator } from "./decorator-registry";

export const INLINE_IMAGE_POSITIONS = ["left", "right", "full"] as const;
export type InlineImagePosition = (typeof INLINE_IMAGE_POSITIONS)[number];

export const isInlineImagePosition = createEnumGuard<InlineImagePosition>(
  INLINE_IMAGE_POSITIONS,
);

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

export class InlineImageNode extends DecoratorNode<ReactElement | null> {
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
    const position = $getState(this, inlinePositionState);
    const width = $getState(this, inlineWidthState);
    const span = document.createElement("span");
    span.setAttribute("data-inline-image", "true");
    span.setAttribute("data-src", $getState(this, inlineSrcState));
    span.setAttribute("data-alt", $getState(this, inlineAltTextState));
    span.setAttribute("data-position", position);
    span.setAttribute("data-width", String(width));
    // 幅は動的 px 値のため inline style で出力（float / display は CSS の
    // [data-inline-image][data-position] が担当 → 公開ページで回り込みが復元される）
    if (position !== "full") {
      span.setAttribute("style", `width:${String(width)}px;`);
    }

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

  override decorate(): ReactElement | null {
    return renderLexicalDecorator("inline-image", {
      src: $getState(this, inlineSrcState),
      altText: $getState(this, inlineAltTextState),
      position: $getState(this, inlinePositionState),
      width: $getState(this, inlineWidthState),
      nodeKey: this.getKey(),
    });
  }
}

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
