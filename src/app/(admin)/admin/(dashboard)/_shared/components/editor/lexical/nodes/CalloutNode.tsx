/**
 * Callout Node
 *
 * @description 注意書き・アラートを表示するElementNode
 * 4種類（info/warning/error/success）に対応
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
  Spread,
} from 'lexical'
import { $applyNodeReplacement, ElementNode, $createParagraphNode, $isElementNode } from 'lexical'

// =============================================================================
// Types
// =============================================================================

export type CalloutType = 'info' | 'warning' | 'error' | 'success'

export const CALLOUT_TYPES: readonly CalloutType[] = ['info', 'warning', 'error', 'success'] as const

export type SerializedCalloutNode = Spread<
  {
    calloutType: CalloutType
  },
  SerializedElementNode
>

// =============================================================================
// Constants
// =============================================================================

const CALLOUT_STYLES: Record<CalloutType, string> = {
  info: 'bg-blue-50 border-blue-500 text-blue-900 dark:bg-blue-950 dark:text-blue-100',
  warning: 'bg-yellow-50 border-yellow-500 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100',
  error: 'bg-red-50 border-red-500 text-red-900 dark:bg-red-950 dark:text-red-100',
  success: 'bg-green-50 border-green-500 text-green-900 dark:bg-green-950 dark:text-green-100',
}

const CALLOUT_BASE_CLASS = 'my-4 p-4 rounded-lg border-l-4'

// =============================================================================
// Type Guards
// =============================================================================

const CALLOUT_TYPE_SET = new Set<string>(CALLOUT_TYPES)

/**
 * 値がCalloutTypeかどうかを判定する（Set-basedパターン）
 */
export function isCalloutType(value: string): value is CalloutType {
  return CALLOUT_TYPE_SET.has(value)
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertCalloutElement(domNode: Node): null | DOMConversionOutput {
  const element = domNode as HTMLElement
  const calloutType = element.getAttribute('data-callout-type')
  if (calloutType && isCalloutType(calloutType)) {
    const node = $createCalloutNode(calloutType)
    return { node }
  }
  return null
}

// =============================================================================
// Node Class
// =============================================================================

export class CalloutNode extends ElementNode {
  __calloutType: CalloutType

  static getType(): string {
    return 'callout'
  }

  static clone(node: CalloutNode): CalloutNode {
    return new CalloutNode(node.__calloutType, node.__key)
  }

  static importJSON(serializedNode: SerializedCalloutNode): CalloutNode {
    const node = $createCalloutNode(serializedNode.calloutType)
    return node
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: Node) => {
        const element = domNode as HTMLElement
        if (element.hasAttribute('data-callout-type')) {
          return {
            conversion: $convertCalloutElement,
            priority: 1,
          }
        }
        return null
      },
    }
  }

  constructor(calloutType: CalloutType = 'info', key?: NodeKey) {
    super(key)
    this.__calloutType = calloutType
  }

  exportJSON(): SerializedCalloutNode {
    return {
      ...super.exportJSON(),
      type: 'callout',
      calloutType: this.__calloutType,
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-callout-type', this.__calloutType)
    element.className = `${CALLOUT_BASE_CLASS} ${CALLOUT_STYLES[this.__calloutType]}`
    return { element }
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('div')
    element.setAttribute('data-callout-type', this.__calloutType)
    element.className = `${CALLOUT_BASE_CLASS} ${CALLOUT_STYLES[this.__calloutType]}`
    return element
  }

  updateDOM(prevNode: CalloutNode, dom: HTMLElement): boolean {
    if (prevNode.__calloutType !== this.__calloutType) {
      dom.setAttribute('data-callout-type', this.__calloutType)
      dom.className = `${CALLOUT_BASE_CLASS} ${CALLOUT_STYLES[this.__calloutType]}`
      return false
    }
    return false
  }

  getCalloutType(): CalloutType {
    return this.getLatest().__calloutType
  }

  setCalloutType(calloutType: CalloutType): void {
    const self = this.getWritable()
    self.__calloutType = calloutType
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
 * Calloutノードを作成する
 *
 * @param calloutType - コールアウトの種類
 * @returns CalloutNode インスタンス
 */
export function $createCalloutNode(calloutType: CalloutType = 'info'): CalloutNode {
  return $applyNodeReplacement(new CalloutNode(calloutType))
}

/**
 * ノードがCalloutNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns CalloutNodeの場合true
 */
export function $isCalloutNode(
  node: LexicalNode | null | undefined
): node is CalloutNode {
  return node instanceof CalloutNode
}
