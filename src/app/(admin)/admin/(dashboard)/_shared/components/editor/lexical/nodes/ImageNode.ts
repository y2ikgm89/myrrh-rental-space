/**
 * Image Node
 *
 * @description 画像を表示するDecoratorNode（リサイズ＋アライメント対応）
 * server / headless でも import 可能。編集 UI は ImageNode.decorator.client。
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
import { createEnumGuard, parseString } from "../config/type-guards";
import { omitUndefined } from "@/shared/lib/serialize";
import { renderLexicalDecorator } from "./decorator-registry";

export const IMAGE_ALIGNMENTS = ["left", "center", "right"] as const;
export type ImageAlignment = (typeof IMAGE_ALIGNMENTS)[number];

export const isImageAlignment =
  createEnumGuard<ImageAlignment>(IMAGE_ALIGNMENTS);

export const srcState = createState("src", {
  parse: parseString,
});

export const altState = createState("alt", {
  parse: parseString,
});

export const widthState = createState("width", {
  parse: (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined,
});

export const heightState = createState("height", {
  parse: (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined,
});

export const alignmentState = createState("alignment", {
  parse: (v: unknown): ImageAlignment =>
    typeof v === "string" && isImageAlignment(v) ? v : "center",
});

export const captionState = createState("caption", {
  parse: parseString,
});

function $convertImageElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  if (element instanceof HTMLImageElement) {
    const src = element.getAttribute("src");
    if (src) {
      const alt = element.getAttribute("alt") ?? "";
      const node = $createImageNode({
        src,
        alt,
        ...(element.width && { width: element.width }),
        ...(element.height && { height: element.height }),
      });
      return { node };
    }
  }
  return null;
}

export class ImageNode extends DecoratorNode<ReactElement | null> {
  override $config() {
    return this.config("image", {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: srcState },
        { flat: true, stateConfig: altState },
        { flat: true, stateConfig: widthState },
        { flat: true, stateConfig: heightState },
        { flat: true, stateConfig: alignmentState },
        { flat: true, stateConfig: captionState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      img: () => ({
        conversion: $convertImageElement,
        priority: 0,
      }),
    };
  }

  override exportDOM(): DOMExportOutput {
    const figure = document.createElement("figure");
    figure.setAttribute("data-image", "true");
    figure.setAttribute(
      "data-image-alignment",
      $getState(this, alignmentState),
    );

    const img = document.createElement("img");
    img.setAttribute("src", $getState(this, srcState));
    img.setAttribute("alt", $getState(this, altState));
    const width = $getState(this, widthState);
    const height = $getState(this, heightState);
    if (width) img.setAttribute("width", String(width));
    if (height) img.setAttribute("height", String(height));
    figure.appendChild(img);

    const caption = $getState(this, captionState);
    if (caption) {
      const figcaption = document.createElement("figcaption");
      figcaption.setAttribute("data-image-caption", "true");
      figcaption.textContent = caption;
      figure.appendChild(figcaption);
    }

    return { element: figure };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-image", "true");
    return div;
  }

  override updateDOM(): false {
    return false;
  }

  override decorate(): ReactElement | null {
    const props = omitUndefined({
      src: $getState(this, srcState),
      alt: $getState(this, altState),
      width: $getState(this, widthState),
      height: $getState(this, heightState),
      alignment: $getState(this, alignmentState),
      caption: $getState(this, captionState),
      nodeKey: this.getKey(),
    });
    return renderLexicalDecorator("image", props);
  }
}

export function $createImageNode({
  src,
  alt = "",
  width,
  height,
  alignment = "center",
  caption = "",
}: {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  alignment?: ImageAlignment;
  caption?: string;
}): ImageNode {
  const node = $create(ImageNode);
  $setState(node, srcState, src);
  $setState(node, altState, alt);
  if (width !== undefined) $setState(node, widthState, width);
  if (height !== undefined) $setState(node, heightState, height);
  $setState(node, alignmentState, alignment);
  $setState(node, captionState, caption);
  return node;
}

export function $isImageNode(
  node: LexicalNode | null | undefined,
): node is ImageNode {
  return node instanceof ImageNode;
}
