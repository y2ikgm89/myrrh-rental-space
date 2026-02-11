/**
 * PullQuote Node
 *
 * @description プルクォート（強調引用）の親コンテナ
 * 子ノード: PullQuoteTextNode + PullQuoteCitationNode
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

export type PullQuoteStyle = 'classic' | 'modern' | 'minimal'

export const PULL_QUOTE_STYLES: readonly PullQuoteStyle[] = ['classic', 'modern', 'minimal'] as const

export interface SerializedPullQuoteNode extends SerializedElementNode {
  quoteStyle: PullQuoteStyle
}

// =============================================================================
// Type Guard (Set-based pattern for type safety)
// =============================================================================

const PULL_QUOTE_STYLE_SET = new Set<string>(PULL_QUOTE_STYLES)

export function isPullQuoteStyle(value: string): value is PullQuoteStyle {
  return PULL_QUOTE_STYLE_SET.has(value)
}

// =============================================================================
// Constants
// =============================================================================

const STYLE_CLASSES: Record<PullQuoteStyle, string> = {
  classic: 'border-l-4 border-primary bg-muted/30 px-8 py-6',
  modern: 'border-y-2 border-primary/50 bg-gradient-to-r from-primary/5 to-transparent px-8 py-8',
  minimal: 'border-l-2 border-muted-foreground/30 pl-6 py-4',
}

const BASE_CLASS = 'my-8 relative'

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertPullQuoteElement(domNode: Node): null | DOMConversionOutput {
  const element = domNode as HTMLElement
  const styleAttr = element.getAttribute('data-pull-quote-style')
  const style = styleAttr && isPullQuoteStyle(styleAttr) ? styleAttr : 'classic'
  const node = $createPullQuoteNode(style)
  return { node }
}

// =============================================================================
// Node Class
// =============================================================================

export class PullQuoteNode extends ElementNode {
  __quoteStyle: PullQuoteStyle

  static getType(): string {
    return 'pull-quote'
  }

  static clone(node: PullQuoteNode): PullQuoteNode {
    return new PullQuoteNode(node.__quoteStyle, node.__key)
  }

  static importJSON(serializedNode: SerializedPullQuoteNode): PullQuoteNode {
    return $createPullQuoteNode(serializedNode.quoteStyle).updateFromJSON(serializedNode)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      figure: (domNode: Node) => {
        const element = domNode as HTMLElement
        if (element.hasAttribute('data-pull-quote')) {
          return {
            conversion: $convertPullQuoteElement,
            priority: 1,
          }
        }
        return null
      },
    }
  }

  constructor(quoteStyle: PullQuoteStyle = 'classic', key?: NodeKey) {
    super(key)
    this.__quoteStyle = quoteStyle
  }

  exportJSON(): SerializedPullQuoteNode {
    return {
      ...super.exportJSON(),
      quoteStyle: this.__quoteStyle,
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('figure')
    element.setAttribute('data-pull-quote', 'true')
    element.setAttribute('data-pull-quote-style', this.__quoteStyle)
    element.className = `${BASE_CLASS} ${STYLE_CLASSES[this.__quoteStyle]}`
    return { element }
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('figure')
    element.setAttribute('data-pull-quote', 'true')
    element.setAttribute('data-pull-quote-style', this.__quoteStyle)
    element.className = `${BASE_CLASS} ${STYLE_CLASSES[this.__quoteStyle]}`
    return element
  }

  updateDOM(prevNode: PullQuoteNode, dom: HTMLElement): boolean {
    if (prevNode.__quoteStyle !== this.__quoteStyle) {
      dom.setAttribute('data-pull-quote-style', this.__quoteStyle)
      dom.className = `${BASE_CLASS} ${STYLE_CLASSES[this.__quoteStyle]}`
      return false
    }
    return false
  }

  getQuoteStyle(): PullQuoteStyle {
    return this.getLatest().__quoteStyle
  }

  setQuoteStyle(style: PullQuoteStyle): void {
    const self = this.getWritable()
    self.__quoteStyle = style
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

    this.replace(paragraph)
    return true
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * PullQuoteノードを作成する
 *
 * @param quoteStyle - 引用スタイル
 * @returns PullQuoteNode インスタンス
 */
export function $createPullQuoteNode(quoteStyle: PullQuoteStyle = 'classic'): PullQuoteNode {
  return $applyNodeReplacement(new PullQuoteNode(quoteStyle))
}

/**
 * ノードがPullQuoteNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns PullQuoteNodeの場合true
 */
export function $isPullQuoteNode(
  node: LexicalNode | null | undefined
): node is PullQuoteNode {
  return node instanceof PullQuoteNode
}
