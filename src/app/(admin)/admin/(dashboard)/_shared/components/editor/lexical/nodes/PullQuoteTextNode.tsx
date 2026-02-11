/**
 * PullQuoteText Node
 *
 * @description プルクォートの引用テキスト部分
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
export interface SerializedPullQuoteTextNode extends SerializedElementNode {}

// =============================================================================
// Constants
// =============================================================================

const TEXT_CLASS = 'text-xl font-medium italic text-foreground leading-relaxed'

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertPullQuoteTextElement(_domNode: Node): null | DOMConversionOutput {
  const node = $createPullQuoteTextNode()
  return { node }
}

// =============================================================================
// Node Class
// =============================================================================

export class PullQuoteTextNode extends ElementNode {
  static getType(): string {
    return 'pull-quote-text'
  }

  static clone(node: PullQuoteTextNode): PullQuoteTextNode {
    return new PullQuoteTextNode(node.__key)
  }

  static importJSON(serializedNode: SerializedPullQuoteTextNode): PullQuoteTextNode {
    return $createPullQuoteTextNode().updateFromJSON(serializedNode)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      blockquote: (domNode: Node) => {
        const element = domNode as HTMLElement
        if (element.hasAttribute('data-pull-quote-text')) {
          return {
            conversion: $convertPullQuoteTextElement,
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

  exportJSON(): SerializedPullQuoteTextNode {
    return {
      ...super.exportJSON(),
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('blockquote')
    element.setAttribute('data-pull-quote-text', 'true')
    element.className = TEXT_CLASS
    return { element }
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('blockquote')
    element.setAttribute('data-pull-quote-text', 'true')
    element.className = TEXT_CLASS
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
 * PullQuoteTextノードを作成する
 *
 * @returns PullQuoteTextNode インスタンス
 */
export function $createPullQuoteTextNode(): PullQuoteTextNode {
  return $applyNodeReplacement(new PullQuoteTextNode())
}

/**
 * ノードがPullQuoteTextNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns PullQuoteTextNodeの場合true
 */
export function $isPullQuoteTextNode(
  node: LexicalNode | null | undefined
): node is PullQuoteTextNode {
  return node instanceof PullQuoteTextNode
}
