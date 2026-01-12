/**
 * Callout Node
 *
 * コールアウト/アラートボックスのカスタムノード
 * DecoratorNodeを使用してReactコンポーネントをレンダリング
 *
 * HTML出力形式:
 * <div data-callout data-type="info|warning|error|success">
 *   コンテンツ
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
const CalloutComponent = lazy(() =>
  import('./CalloutComponent').then((m) => ({
    default: m.CalloutComponent,
  }))
)

export type CalloutType = 'info' | 'warning' | 'error' | 'success'

export type SerializedCalloutNode = Spread<
  {
    calloutType: CalloutType
    content: string
  },
  SerializedLexicalNode
>

function $convertCalloutElement(domNode: HTMLElement): DOMConversionOutput | null {
  const type = domNode.getAttribute('data-type') as CalloutType
  const content = domNode.textContent || ''

  if (type) {
    const node = $createCalloutNode(type, content)
    return { node }
  }
  return null
}

export class CalloutNode extends DecoratorNode<ReactElement> {
  __calloutType: CalloutType
  __content: string

  static getType(): string {
    return 'callout'
  }

  static clone(node: CalloutNode): CalloutNode {
    return new CalloutNode(node.__calloutType, node.__content, node.__key)
  }

  constructor(
    calloutType: CalloutType = 'info',
    content: string = '',
    key?: NodeKey
  ) {
    super(key)
    this.__calloutType = calloutType
    this.__content = content
  }

  static importJSON(serializedNode: SerializedCalloutNode): CalloutNode {
    return $createCalloutNode(
      serializedNode.calloutType,
      serializedNode.content
    ).updateFromJSON(serializedNode)
  }

  updateFromJSON(
    serializedNode: LexicalUpdateJSON<SerializedCalloutNode>
  ): this {
    return super.updateFromJSON(serializedNode)
  }

  exportJSON(): SerializedCalloutNode {
    return {
      ...super.exportJSON(),
      calloutType: this.__calloutType,
      content: this.__content,
    }
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute('data-callout')) {
          return null
        }
        return {
          conversion: $convertCalloutElement,
          priority: 2,
        }
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-callout', '')
    element.setAttribute('data-type', this.__calloutType)
    element.textContent = this.__content
    return { element }
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'callout-wrapper my-4'
    return div
  }

  updateDOM(): false {
    return false
  }

  getCalloutType(): CalloutType {
    return this.__calloutType
  }

  getContent(): string {
    return this.__content
  }

  setCalloutType(type: CalloutType): void {
    const writable = this.getWritable()
    writable.__calloutType = type
  }

  setContent(content: string): void {
    const writable = this.getWritable()
    writable.__content = content
  }

  decorate(): ReactElement {
    return (
      <Suspense
        fallback={
          <div className="animate-pulse bg-muted rounded-lg h-16 flex items-center justify-center">
            <span className="text-muted-foreground">読み込み中...</span>
          </div>
        }
      >
        <CalloutComponent
          nodeKey={this.__key}
          calloutType={this.__calloutType}
          content={this.__content}
        />
      </Suspense>
    )
  }
}

export function $createCalloutNode(
  calloutType: CalloutType = 'info',
  content: string = ''
): CalloutNode {
  return $applyNodeReplacement(new CalloutNode(calloutType, content))
}

export function $isCalloutNode(
  node: LexicalNode | null | undefined
): node is CalloutNode {
  return node instanceof CalloutNode
}
