/**
 * FAQ Node
 *
 * FAQアコーディオンのカスタムノード
 * DecoratorNodeを使用してReactコンポーネントをレンダリング
 *
 * HTML出力形式:
 * <div data-faq>
 *   <details>
 *     <summary>質問1</summary>
 *     <div>回答1</div>
 *   </details>
 *   ...
 * </div>
 */

'use client'

import type { ReactElement } from 'react'
import {
  $applyNodeReplacement,
  DecoratorNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type LexicalNode,
  type LexicalUpdateJSON,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical'
import { Suspense, lazy } from 'react'

// Lazy load the component
const FAQComponent = lazy(() =>
  import('./FAQComponent').then((m) => ({
    default: m.FAQComponent,
  }))
)

export type FAQItem = {
  id: string
  question: string
  answer: string
}

export type SerializedFAQNode = Spread<
  {
    items: FAQItem[]
  },
  SerializedLexicalNode
>

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

function $convertFAQElement(domNode: HTMLElement): DOMConversionOutput | null {
  const detailsElements = domNode.querySelectorAll('details')
  const items: FAQItem[] = []

  detailsElements.forEach((details) => {
    const summary = details.querySelector('summary')
    const answerDiv = details.querySelector('div')
    if (summary) {
      items.push({
        id: generateId(),
        question: summary.textContent || '',
        answer: answerDiv?.textContent || '',
      })
    }
  })

  if (items.length > 0) {
    const node = $createFAQNode(items)
    return { node }
  }
  return null
}

export class FAQNode extends DecoratorNode<ReactElement> {
  __items: FAQItem[]

  static getType(): string {
    return 'faq'
  }

  static clone(node: FAQNode): FAQNode {
    return new FAQNode([...node.__items], node.__key)
  }

  constructor(items: FAQItem[] = [], key?: NodeKey) {
    super(key)
    this.__items =
      items.length > 0
        ? items
        : [{ id: generateId(), question: '', answer: '' }]
  }

  static importJSON(serializedNode: SerializedFAQNode): FAQNode {
    return $createFAQNode(serializedNode.items).updateFromJSON(serializedNode)
  }

  updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedFAQNode>): this {
    return super.updateFromJSON(serializedNode)
  }

  exportJSON(): SerializedFAQNode {
    return {
      ...super.exportJSON(),
      items: this.__items,
    }
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute('data-faq')) {
          return null
        }
        return {
          conversion: $convertFAQElement,
          priority: 2,
        }
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const container = document.createElement('div')
    container.setAttribute('data-faq', '')

    this.__items.forEach((item) => {
      if (item.question.trim()) {
        const details = document.createElement('details')
        const summary = document.createElement('summary')
        const answerDiv = document.createElement('div')

        summary.textContent = item.question
        answerDiv.textContent = item.answer

        details.appendChild(summary)
        details.appendChild(answerDiv)
        container.appendChild(details)
      }
    })

    return { element: container }
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'faq-wrapper my-4'
    return div
  }

  updateDOM(): false {
    return false
  }

  getItems(): FAQItem[] {
    return this.__items
  }

  setItems(items: FAQItem[]): void {
    const writable = this.getWritable()
    writable.__items = items
  }

  addItem(): void {
    const writable = this.getWritable()
    writable.__items = [
      ...writable.__items,
      { id: generateId(), question: '', answer: '' },
    ]
  }

  removeItem(id: string): void {
    const writable = this.getWritable()
    writable.__items = writable.__items.filter((item) => item.id !== id)
    if (writable.__items.length === 0) {
      writable.__items = [{ id: generateId(), question: '', answer: '' }]
    }
  }

  updateItem(id: string, field: 'question' | 'answer', value: string): void {
    const writable = this.getWritable()
    writable.__items = writable.__items.map((item) =>
      item.id === id ? { ...item, [field]: value } : item
    )
  }

  reorderItems(fromIndex: number, toIndex: number): void {
    const writable = this.getWritable()
    const items = [...writable.__items]
    const [removed] = items.splice(fromIndex, 1)
    items.splice(toIndex, 0, removed)
    writable.__items = items
  }

  decorate(): ReactElement {
    return (
      <Suspense
        fallback={
          <div className="animate-pulse bg-muted rounded-lg h-32 flex items-center justify-center">
            <span className="text-muted-foreground">読み込み中...</span>
          </div>
        }
      >
        <FAQComponent nodeKey={this.__key} items={this.__items} />
      </Suspense>
    )
  }
}

export function $createFAQNode(items?: FAQItem[]): FAQNode {
  return $applyNodeReplacement(new FAQNode(items))
}

export function $isFAQNode(
  node: LexicalNode | null | undefined
): node is FAQNode {
  return node instanceof FAQNode
}
