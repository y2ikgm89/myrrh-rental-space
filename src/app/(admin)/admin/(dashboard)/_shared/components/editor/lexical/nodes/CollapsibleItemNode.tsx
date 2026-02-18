/**
 * Collapsible Item Node
 *
 * @description 個別の折りたたみアイテムを表すElementNode
 * 子ノード: CollapsibleTitleNode + CollapsibleContentNode
 *
 * スタイルは lexical-content.css の [data-collapsible-item] セレクターで管理
 */

'use client'

import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
} from 'lexical'
import { $create, $getState, $getStateChange, $setState, createState, ElementNode } from 'lexical'

// =============================================================================
// State
// =============================================================================

export const openState = createState('open', {
  parse: (v: unknown): boolean => typeof v === 'boolean' ? v : false,
})

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertCollapsibleItemElement(element: HTMLElement): null | DOMConversionOutput {
  const isOpen = element instanceof HTMLDetailsElement ? element.open : false
  const node = $createCollapsibleItemNode(isOpen)
  return { node }
}

// =============================================================================
// Node Class
// =============================================================================

export class CollapsibleItemNode extends ElementNode {
  override $config() {
    return this.config('collapsible-item', {
      extends: ElementNode,
      stateConfigs: [{ flat: true, stateConfig: openState }],
    })
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      details: (element: HTMLElement) => {
        if (element.hasAttribute('data-collapsible-item')) {
          return {
            conversion: $convertCollapsibleItemElement,
            priority: 2,
          }
        }
        return null
      },
    }
  }

  override exportDOM(): DOMExportOutput {
    const isOpen = $getState(this, openState)
    const element = document.createElement('details')
    element.setAttribute('data-collapsible-item', 'true')
    if (isOpen) {
      element.setAttribute('open', 'true')
    }
    return { element }
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const isOpen = $getState(this, openState)
    const element = document.createElement('div')
    element.setAttribute('data-collapsible-item', 'true')
    if (isOpen) {
      element.setAttribute('data-open', 'true')
    }
    return element
  }

  override updateDOM(prevNode: CollapsibleItemNode, dom: HTMLElement): boolean {
    const change = $getStateChange(this, prevNode, openState)
    if (change) {
      const [newOpen] = change
      if (newOpen) {
        dom.setAttribute('data-open', 'true')
      } else {
        dom.removeAttribute('data-open')
      }
    }
    return false
  }

  override canInsertTextBefore(): false {
    return false
  }

  override canInsertTextAfter(): false {
    return false
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function $createCollapsibleItemNode(open: boolean = true): CollapsibleItemNode {
  return $setState($create(CollapsibleItemNode), openState, open)
}

export function $isCollapsibleItemNode(
  node: LexicalNode | null | undefined
): node is CollapsibleItemNode {
  return node instanceof CollapsibleItemNode
}
