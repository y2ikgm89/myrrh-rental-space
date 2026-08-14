/**
 * Figma Node
 *
 * @description Figma デザインを埋め込む DecoratorNode
 * server / headless でも import 可能。編集 UI は FigmaNode.decorator.client。
 */

import type { ReactElement } from "react";
import type {
  DOMConversionMap,
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
import { parseString } from "../config/type-guards";
import { renderLexicalDecorator } from "./decorator-registry";
import { isAllowedLexicalIframeHostname } from "@/shared/lib/html/lexical-html-sanitize-config";

export function toFigmaEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("figma.com")) return null;
    const encoded = encodeURIComponent(url);
    return `https://www.figma.com/embed?embed_host=share&url=${encoded}`;
  } catch {
    return null;
  }
}

export const figmaEmbedUrlState = createState("embedUrl", {
  parse: parseString,
});

export const figmaLabelState = createState("label", {
  parse: parseString,
});

export class FigmaNode extends DecoratorNode<ReactElement | null> {
  override $config() {
    return this.config("figma", {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: figmaEmbedUrlState },
        { flat: true, stateConfig: figmaLabelState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (domNode) => {
        if (
          !(domNode instanceof HTMLElement) ||
          !domNode.hasAttribute("data-figma")
        )
          return null;
        return {
          conversion: (element) => {
            const iframe = element.querySelector("iframe");
            const embedUrl = iframe?.getAttribute("src") ?? "";
            if (!isAllowedLexicalIframeHostname(embedUrl)) return null;
            const node = $createFigmaNode({
              embedUrl,
              label: element.getAttribute("data-figma-label") ?? "",
            });
            return { node };
          },
          priority: 2,
        };
      },
    };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-lexical-figma", "true");
    return div;
  }

  override updateDOM(): false {
    return false;
  }

  override exportDOM(): DOMExportOutput {
    const wrapper = document.createElement("div");
    const label = $getState(this, figmaLabelState);
    wrapper.setAttribute("data-figma", "true");
    wrapper.setAttribute("data-figma-label", label);
    if (label) {
      const labelEl = document.createElement("p");
      labelEl.setAttribute("data-figma-label-text", "");
      labelEl.textContent = label;
      wrapper.appendChild(labelEl);
    }
    const iframe = document.createElement("iframe");
    iframe.setAttribute("src", $getState(this, figmaEmbedUrlState));
    iframe.setAttribute("title", label || "Figma デザイン");
    iframe.setAttribute("allow", "fullscreen");
    iframe.setAttribute("loading", "lazy");
    wrapper.appendChild(iframe);
    return { element: wrapper };
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
    return renderLexicalDecorator("figma", {
      embedUrl: $getState(this, figmaEmbedUrlState),
      label: $getState(this, figmaLabelState),
      nodeKey: this.getKey(),
    });
  }
}

/**
 * FigmaNode を作成する
 *
 * @param params - Figma 埋め込みのパラメータ
 * @returns FigmaNode インスタンス
 */
export function $createFigmaNode(params: {
  embedUrl: string;
  label?: string;
}): FigmaNode {
  const node = $create(FigmaNode);
  $setState(node, figmaEmbedUrlState, params.embedUrl);
  $setState(node, figmaLabelState, params.label ?? "");
  return node;
}

/**
 * ノードが FigmaNode かどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns FigmaNode の場合 true
 */
export function $isFigmaNode(
  node: LexicalNode | null | undefined,
): node is FigmaNode {
  return node instanceof FigmaNode;
}
