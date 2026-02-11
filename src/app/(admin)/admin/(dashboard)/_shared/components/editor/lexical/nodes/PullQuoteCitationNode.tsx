/**
 * PullQuoteCitation Node
 *
 * @description プルクォートの著者/出典部分
 * PullQuoteNodeの子として使用
 */

'use client'

import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedElementNode,
} from 'lexical'
import { $applyNodeReplacement, ElementNode, $createParagraphNode, $isElementNode } from 'lexical'

// =============================================================================
// Types
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SerializedPullQuoteCitationNode extends SerializedElementNode {}

// =============================================================================
// Constants
// =============================================================================

const CITATION_CLASS = 'mt-4 text-sm text-muted-foreground before:content-["—_"]'

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertPullQuoteCitationElement(_domNode: Node): null | DOMConversionOutput {
  const node = $createPullQuoteCitationNode()
  return { node }
}

// =============================================================================
// Node Class
// =============================================================================

export class PullQuoteCitationNode extends ElementNode {
  static getType(): string {
    return 'pull-quote-citation'
  }

  static clone(node: PullQuoteCitationNode): PullQuoteCitationNode {
    return new PullQuoteCitationNode(node.__key)
  }

  static importJSON(serializedNode: SerializedPullQuoteCitationNode): PullQuoteCitationNode {
    return $createPullQuoteCitationNode().updateFromJSON(serializedNode)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      figcaption: (domNode: Node) => {
        const element = domNode as HTMLElement
        if (element.hasAttribute('data-pull-quote-citation')) {
          return {
            conversion: $convertPullQuoteCitationElement,
            priority: 1,
          }
        }
        return null
      },
    }
  }

  constructor(key?: NodeKey) {
    super(key)
  }

  exportJSON(): SerializedPullQuoteCitationNode {
    return {
      ...super.exportJSON(),
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('figcaption')
    element.setAttribute('data-pull-quote-citation', 'true')
    element.className = CITATION_CLASS
    return { element }
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('figcaption')
    element.setAttribute('data-pull-quote-citation', 'true')
    element.className = CITATION_CLASS
    return element
  }

  updateDOM(): boolean {
    return false
  }

  canInsertTextBefore(): false {
    return false
  }

  canInsertTextAfter(): false {
    return false
  }

  collapseAtStart(): boolean {
    const children = this.getChildren()
    const paragraph = $createParagraphNode()

    if (children.length > 0) {
      const firstChild = children[0]
      if ($isElementNode(firstChild)) {
        const firstChildChildren = firstChild.getChildren()
        for (const child of firstChildChildren) {
          paragraph.append(child)
        }
      }
    }

    const parent = this.getParent()
    if (parent) {
      parent.replace(paragraph)
    }
    return true
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
  return $applyNodeReplacement(new PullQuoteCitationNode())
}

/**
 * ノードがPullQuoteCitationNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns PullQuoteCitationNodeの場合true
 */
export function $isPullQuoteCitationNode(
  node: LexicalNode | null | undefined
): node is PullQuoteCitationNode {
  return node instanceof PullQuoteCitationNode
}
