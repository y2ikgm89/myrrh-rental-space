/**
 * PullQuoteText Node
 *
 * @description プルクォートの引用テキスト部分
 * PullQuoteNodeの子として使用
 */

"use client";

import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
} from "lexical";
import { $create, ElementNode } from "lexical";

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertPullQuoteTextElement(
  _element: HTMLElement,
): null | DOMConversionOutput {
  const node = $createPullQuoteTextNode();
  return { node };
}

// =============================================================================
// Node Class
// =============================================================================

export class PullQuoteTextNode extends ElementNode {
  override $config() {
    return this.config("pull-quote-text", { extends: ElementNode });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      blockquote: (element: HTMLElement) => {
        if (element.hasAttribute("data-pull-quote-text")) {
          return {
            conversion: $convertPullQuoteTextElement,
            priority: 1,
          };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const element = document.createElement("blockquote");
    element.setAttribute("data-pull-quote-text", "true");
    return { element };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement("blockquote");
    element.setAttribute("data-pull-quote-text", "true");
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

/**
 * PullQuoteTextノードを作成する
 *
 * @returns PullQuoteTextNode インスタンス
 */
export function $createPullQuoteTextNode(): PullQuoteTextNode {
  return $create(PullQuoteTextNode);
}

/**
 * ノードがPullQuoteTextNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns PullQuoteTextNodeの場合true
 */
export function $isPullQuoteTextNode(
  node: LexicalNode | null | undefined,
): node is PullQuoteTextNode {
  return node instanceof PullQuoteTextNode;
}
