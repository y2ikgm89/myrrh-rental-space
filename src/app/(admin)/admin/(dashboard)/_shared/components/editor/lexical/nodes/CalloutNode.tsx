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
} from 'lexical'
import { $create, $getState, $getStateChange, $setState, createState, ElementNode, $createParagraphNode, $isElementNode } from 'lexical'
import { createEnumGuard } from '../config/type-guards'

// =============================================================================
// Types
// =============================================================================

export type CalloutType = 'info' | 'warning' | 'error' | 'success'

export const CALLOUT_TYPES: readonly CalloutType[] = ['info', 'warning', 'error', 'success'] as const

// =============================================================================
// Type Guards
// =============================================================================

export const isCalloutType = createEnumGuard<CalloutType>(CALLOUT_TYPES)

// =============================================================================
// State
// =============================================================================

export const calloutTypeState = createState('calloutType', {
  parse: (v: unknown): CalloutType =>
    typeof v === 'string' && isCalloutType(v) ? v : 'info',
})

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertCalloutElement(element: HTMLElement): null | DOMConversionOutput {
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
  override $config() {
    return this.config('callout', {
      extends: ElementNode,
      stateConfigs: [{ flat: true, stateConfig: calloutTypeState }],
    })
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
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

  override exportDOM(): DOMExportOutput {
    const calloutType = $getState(this, calloutTypeState)
    const element = document.createElement('div')
    element.setAttribute('data-callout-type', calloutType)
    return { element }
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const calloutType = $getState(this, calloutTypeState)
    const element = document.createElement('div')
    element.setAttribute('data-callout-type', calloutType)
    return element
  }

  override updateDOM(prevNode: CalloutNode, dom: HTMLElement): boolean {
    const change = $getStateChange(this, prevNode, calloutTypeState)
    if (change) {
      const [newType] = change
      dom.setAttribute('data-callout-type', newType)
    }
    return false
  }

  override canInsertTextBefore(): false {
    return false
  }

  override canInsertTextAfter(): false {
    return false
  }

  override collapseAtStart(): boolean {
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
  return $setState($create(CalloutNode), calloutTypeState, calloutType)
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
