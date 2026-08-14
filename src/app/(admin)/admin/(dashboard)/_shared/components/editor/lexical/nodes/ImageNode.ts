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
import { sanitizeLexicalUrlScheme } from "@/shared/lib/html/lexical-html-sanitize-config";

export const IMAGE_ALIGNMENTS = ["left", "center", "right"] as const;
export type ImageAlignment = (typeof IMAGE_ALIGNMENTS)[number];

export const isImageAlignment =
  createEnumGuard<ImageAlignment>(IMAGE_ALIGNMENTS);

// $convertImageElement / $convertImageFigureElement は貼り付け HTML の src 属性を
// 検証なしで読むため、editor state（contentJson 正本）自体に javascript: 等の危険
// スキームが生のまま残っていた（実測で確認済み。sanitize-html の allowedSchemes は
// 保存時の最終 HTML にのみ効き、editor state・decorator 描画経路は素通り）。
// LinkNode.sanitizeUrl と同じ sanitizeLexicalUrlScheme で import 時・state parse 時の
// 両方をガードする（BookmarkNode/ButtonNode/FileNode と同型のパターン）。
export const srcState = createState("src", {
  parse: (v: unknown): string =>
    typeof v === "string" ? sanitizeLexicalUrlScheme(v) : "",
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
        src: sanitizeLexicalUrlScheme(src),
        alt,
        ...(element.width && { width: element.width }),
        ...(element.height && { height: element.height }),
      });
      return { node };
    }
  }
  return null;
}

// exportDOM が出力する `<figure data-image data-image-alignment="...">` を購読し、
// alignment と figcaption キャプションを復元する。figure に包まれていない素の <img>
// (`$convertImageElement` / 上記) は既存 fallback として引き続き機能させる。
// DecoratorNode の子は append されない (Lexical 公式挙動) ため、figure の子である
// <img> / <figcaption> が個別に走る importDOM 変換結果は自動的に破棄される。
function $convertImageFigureElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const img = element.querySelector("img");
  if (!(img instanceof HTMLImageElement)) return null;
  const rawSrc = img.getAttribute("src");
  if (!rawSrc) return null;
  const src = sanitizeLexicalUrlScheme(rawSrc);

  const alt = img.getAttribute("alt") ?? "";
  const alignmentAttr = element.getAttribute("data-image-alignment");
  const alignment: ImageAlignment =
    alignmentAttr && isImageAlignment(alignmentAttr) ? alignmentAttr : "center";
  const figcaption = element.querySelector("figcaption[data-image-caption]");
  const caption = figcaption?.textContent ?? "";

  const node = $createImageNode({
    src,
    alt,
    ...(img.width && { width: img.width }),
    ...(img.height && { height: img.height }),
    alignment,
    caption,
  });
  return { node };
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
      figure: (element: HTMLElement) => {
        if (element.hasAttribute("data-image")) {
          return {
            conversion: $convertImageFigureElement,
            priority: 1,
          };
        }
        return null;
      },
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

  /**
   * block DOM を出す DecoratorNode は block として扱わせる（監査 F-26）。
   *
   * Lexical の DecoratorNode 既定は `isInline() === true`。inline のままだと
   * `$insertNodes` が ParagraphNode の**子**として splice するので、exportDOM は
   * `<p>前半<div>…</div>後半</p>` を出す。保存パイプラインの enrich が DOMParser で
   * 再パースするため、HTML 仕様どおり `<div>` の直前で `<p>` が閉じられ、
   * **画像より後ろの本文が `<p>` の外へ出て段落スタイルを失い、末尾に空段落が残る**。
   * 編集画面は Lexical が DOM を programmatic に組むので再パースが起きず、
   * 管理者には正常に見える。
   */
  override isInline(): false {
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
