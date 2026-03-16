/**
 * PullQuoteCitation Node
 *
 * @description プルクォートの著者/出典部分
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

function $convertPullQuoteCitationElement(
  _element: HTMLElement,
): null | DOMConversionOutput {
  const node = $createPullQuoteCitationNode();
  return { node };
}

// =============================================================================
// Node Class
// =============================================================================

export class PullQuoteCitationNode extends ElementNode {
  override $config() {
    return this.config("pull-quote-citation", { extends: ElementNode });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      figcaption: (element: HTMLElement) => {
        if (element.hasAttribute("data-pull-quote-citation")) {
          return {
            conversion: $convertPullQuoteCitationElement,
            priority: 1,
          };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const element = document.createElement("figcaption");
    element.setAttribute("data-pull-quote-citation", "true");
    return { element };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement("figcaption");
    element.setAttribute("data-pull-quote-citation", "true");
    return element;
  }

  override updateDOM(): false {
    return false;
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
 * PullQuoteCitationノードを作成する
 *
 * @returns PullQuoteCitationNode インスタンス
 */
export function $createPullQuoteCitationNode(): PullQuoteCitationNode {
  return $create(PullQuoteCitationNode);
}

/**
 * ノードがPullQuoteCitationNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns PullQuoteCitationNodeの場合true
 */
export function $isPullQuoteCitationNode(
  node: LexicalNode | null | undefined,
): node is PullQuoteCitationNode {
  return node instanceof PullQuoteCitationNode;
}
