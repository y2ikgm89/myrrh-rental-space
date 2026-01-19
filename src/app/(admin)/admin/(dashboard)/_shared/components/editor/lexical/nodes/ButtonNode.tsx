/**
 * Button Node
 *
 * ボタン/CTAリンクのカスタムノード
 * DecoratorNodeを使用してReactコンポーネントをレンダリング
 *
 * HTML出力形式:
 * <a data-button data-variant="primary|secondary|outline" href="..." target="_blank|_self">
 *   ボタンテキスト
 * </a>
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
const ButtonComponent = lazy(() =>
  import('./ButtonComponent').then((m) => ({
    default: m.ButtonComponent,
  }))
)

export type ButtonVariant = 'primary' | 'secondary' | 'outline'

export type SerializedButtonNode = Spread<
  {
    text: string
    url: string
    variant: ButtonVariant
    openInNewTab: boolean
  },
  SerializedLexicalNode
>

function $convertButtonElement(domNode: HTMLElement): DOMConversionOutput | null {
  const text = domNode.textContent || ''
  const url = domNode.getAttribute('href') || ''
  const variant = (domNode.getAttribute('data-variant') as ButtonVariant) || 'primary'
  const target = domNode.getAttribute('target')
  const openInNewTab = target === '_blank'

  if (text || url) {
    const node = $createButtonNode(text, url, variant, openInNewTab)
    return { node }
  }
  return null
}

export class ButtonNode extends DecoratorNode<ReactElement> {
  __text: string
  __url: string
  __variant: ButtonVariant
  __openInNewTab: boolean

  static getType(): string {
    return 'button'
  }

  static clone(node: ButtonNode): ButtonNode {
    return new ButtonNode(
      node.__text,
      node.__url,
      node.__variant,
      node.__openInNewTab,
      node.__key
    )
  }

  constructor(
    text: string = '',
    url: string = '',
    variant: ButtonVariant = 'primary',
    openInNewTab: boolean = false,
    key?: NodeKey
  ) {
    super(key)
    this.__text = text
    this.__url = url
    this.__variant = variant
    this.__openInNewTab = openInNewTab
  }

  static importJSON(serializedNode: SerializedButtonNode): ButtonNode {
    return $createButtonNode(
      serializedNode.text,
      serializedNode.url,
      serializedNode.variant,
      serializedNode.openInNewTab
    ).updateFromJSON(serializedNode)
  }

  updateFromJSON(
    serializedNode: LexicalUpdateJSON<SerializedButtonNode>
  ): this {
    return super.updateFromJSON(serializedNode)
  }

  exportJSON(): SerializedButtonNode {
    return {
      ...super.exportJSON(),
      text: this.__text,
      url: this.__url,
      variant: this.__variant,
      openInNewTab: this.__openInNewTab,
    }
  }

  static importDOM(): DOMConversionMap | null {
    return {
      a: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute('data-button')) {
          return null
        }
        return {
          conversion: $convertButtonElement,
          priority: 2,
        }
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('a')
    element.setAttribute('data-button', '')
    element.setAttribute('data-variant', this.__variant)
    element.setAttribute('href', this.__url)
    if (this.__openInNewTab) {
      element.setAttribute('target', '_blank')
      element.setAttribute('rel', 'noopener noreferrer')
    }
    element.textContent = this.__text
    return { element }
  }

  createDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'button-wrapper inline-block my-2'
    return span
  }

  updateDOM(): false {
    return false
  }

  isInline(): boolean {
    return true
  }

  getText(): string {
    return this.__text
  }

  getUrl(): string {
    return this.__url
  }

  getVariant(): ButtonVariant {
    return this.__variant
  }

  getOpenInNewTab(): boolean {
    return this.__openInNewTab
  }

  setText(text: string): void {
    const writable = this.getWritable()
    writable.__text = text
  }

  setUrl(url: string): void {
    const writable = this.getWritable()
    writable.__url = url
  }

  setVariant(variant: ButtonVariant): void {
    const writable = this.getWritable()
    writable.__variant = variant
  }

  setOpenInNewTab(openInNewTab: boolean): void {
    const writable = this.getWritable()
    writable.__openInNewTab = openInNewTab
  }

  decorate(): ReactElement {
    return (
      <Suspense
        fallback={
          <span className="inline-block animate-pulse bg-muted rounded px-4 py-2">
            ...
          </span>
        }
      >
        <ButtonComponent
          nodeKey={this.__key}
          text={this.__text}
          url={this.__url}
          variant={this.__variant}
          openInNewTab={this.__openInNewTab}
        />
      </Suspense>
    )
  }
}

export function $createButtonNode(
  text: string = 'ボタン',
  url: string = '',
  variant: ButtonVariant = 'primary',
  openInNewTab: boolean = false
): ButtonNode {
  return $applyNodeReplacement(new ButtonNode(text, url, variant, openInNewTab))
}

export function $isButtonNode(
  node: LexicalNode | null | undefined
): node is ButtonNode {
  return node instanceof ButtonNode
}
