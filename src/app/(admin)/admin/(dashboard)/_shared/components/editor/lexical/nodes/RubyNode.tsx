/**
 * Ruby Node
 *
 * @description ルビ（ふりがな）を表示するインライン DecoratorNode
 */

'use client'

import type { ReactElement } from 'react'
import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
} from 'lexical'
import { $create, $getState, $setState, createState, DecoratorNode } from 'lexical'

// =============================================================================
// State
// =============================================================================

export const rubyBaseTextState = createState('baseText', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : ''),
})

export const rubyTextState = createState('rubyText', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : ''),
})

// =============================================================================
// Node Class
// =============================================================================

export class RubyNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config('ruby', {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: rubyBaseTextState },
        { flat: true, stateConfig: rubyTextState },
      ],
    })
  }

  static override importDOM(): DOMConversionMap {
    return {
      ruby: () => ({
        conversion: (element: HTMLElement): DOMConversionOutput => {
          const rt = element.querySelector('rt')
          const rtText = rt?.textContent ?? ''
          const baseText = Array.from(element.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent ?? '')
            .join('')
            .trim()
          const rubyNode = $createRubyNode(baseText, rtText)
          return { node: rubyNode }
        },
        priority: 1,
      }),
    }
  }

  override exportDOM(): DOMExportOutput {
    const ruby = document.createElement('ruby')
    ruby.setAttribute('data-ruby', 'true')
    ruby.textContent = $getState(this, rubyBaseTextState)
    const rt = document.createElement('rt')
    rt.textContent = $getState(this, rubyTextState)
    ruby.appendChild(rt)
    return { element: ruby }
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const ruby = document.createElement('ruby')
    ruby.setAttribute('data-ruby', 'true')
    return ruby
  }

  override updateDOM(): false {
    return false
  }

  override isInline(): true {
    return true
  }

  override decorate(): ReactElement {
    const baseText = $getState(this, rubyBaseTextState)
    const rubyText = $getState(this, rubyTextState)
    return (
      <ruby data-ruby="true">
        {baseText}
        <rt>{rubyText}</rt>
      </ruby>
    )
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * RubyNodeを作成する
 */
export function $createRubyNode(baseText: string, rubyText: string): RubyNode {
  const node = $create(RubyNode)
  $setState(node, rubyBaseTextState, baseText)
  $setState(node, rubyTextState, rubyText)
  return node
}

/**
 * ノードが RubyNode かどうかを判定する
 */
export function $isRubyNode(node: LexicalNode | null | undefined): node is RubyNode {
  return node instanceof RubyNode
}
