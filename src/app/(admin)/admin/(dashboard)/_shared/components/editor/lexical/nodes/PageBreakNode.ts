/**
 * Page Break Node
 *
 * @description ページ区切りを表示するDecoratorNode
 * 印刷時に改ページとして機能する
 * server / headless でも import 可能。編集 UI は PageBreakNode.decorator.client。
 */

import type { ReactElement } from "react";
import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
} from "lexical";
import { $create, DecoratorNode } from "lexical";
import { renderLexicalDecorator } from "./decorator-registry";

function $convertPageBreakElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  if (element.hasAttribute("data-page-break")) {
    return { node: $createPageBreakNode() };
  }
  return null;
}

export class PageBreakNode extends DecoratorNode<ReactElement | null> {
  override $config() {
    return this.config("page-break", { extends: DecoratorNode });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      figure: (element: HTMLElement) => {
        if (element.hasAttribute("data-page-break")) {
          return {
            conversion: $convertPageBreakElement,
            priority: 1,
          };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const element = document.createElement("figure");
    element.setAttribute("data-page-break", "true");
    const span = document.createElement("span");
    span.textContent = "ページ区切り";
    element.appendChild(span);
    return { element };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    return div;
  }

  override updateDOM(): false {
    return false;
  }

  override getTextContent(): string {
    return "\n";
  }

  override isInline(): false {
    return false;
  }

  override decorate(): ReactElement | null {
    return renderLexicalDecorator("page-break", {
      nodeKey: this.getKey(),
    });
  }
}

/**
 * ページ区切りノードを作成する
 *
 * @returns PageBreakNode インスタンス
 */
export function $createPageBreakNode(): PageBreakNode {
  return $create(PageBreakNode);
}

/**
 * ノードがPageBreakNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns PageBreakNodeの場合true
 */
export function $isPageBreakNode(
  node: LexicalNode | null | undefined,
): node is PageBreakNode {
  return node instanceof PageBreakNode;
}
