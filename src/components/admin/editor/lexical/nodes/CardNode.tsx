/**
 * Card Node
 *
 * カードコンポーネントのカスタムノード
 * DecoratorNodeを使用してReactコンポーネントをレンダリング
 *
 * HTML出力形式:
 * <div data-card>
 *   <img src="..." alt="..." /> (optional)
 *   <h3>タイトル</h3>
 *   <p>説明文</p>
 *   <a href="...">リンクテキスト</a> (optional)
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
const CardComponent = lazy(() =>
  import('./CardComponent').then((m) => ({
    default: m.CardComponent,
  }))
)

export type SerializedCardNode = Spread<
  {
    title: string
    description: string
    imageUrl?: string
    imageAlt?: string
    linkUrl?: string
    linkText?: string
  },
  SerializedLexicalNode
>

function $convertCardElement(domNode: HTMLElement): DOMConversionOutput | null {
  const img = domNode.querySelector('img')
  const h3 = domNode.querySelector('h3')
  const p = domNode.querySelector('p')
  const a = domNode.querySelector('a')

  const title = h3?.textContent || ''
  const description = p?.textContent || ''
  const imageUrl = img?.getAttribute('src') || undefined
  const imageAlt = img?.getAttribute('alt') || undefined
  const linkUrl = a?.getAttribute('href') || undefined
  const linkText = a?.textContent || undefined

  if (title || description) {
    const node = $createCardNode({
      title,
      description,
      imageUrl,
      imageAlt,
      linkUrl,
      linkText,
    })
    return { node }
  }
  return null
}

export type CardNodeOptions = {
  title?: string
  description?: string
  imageUrl?: string
  imageAlt?: string
  linkUrl?: string
  linkText?: string
}

export class CardNode extends DecoratorNode<ReactElement> {
  __title: string
  __description: string
  __imageUrl?: string
  __imageAlt?: string
  __linkUrl?: string
  __linkText?: string

  static getType(): string {
    return 'card'
  }

  static clone(node: CardNode): CardNode {
    return new CardNode(
      {
        title: node.__title,
        description: node.__description,
        imageUrl: node.__imageUrl,
        imageAlt: node.__imageAlt,
        linkUrl: node.__linkUrl,
        linkText: node.__linkText,
      },
      node.__key
    )
  }

  constructor(options: CardNodeOptions = {}, key?: NodeKey) {
    super(key)
    this.__title = options.title || ''
    this.__description = options.description || ''
    this.__imageUrl = options.imageUrl
    this.__imageAlt = options.imageAlt
    this.__linkUrl = options.linkUrl
    this.__linkText = options.linkText
  }

  static importJSON(serializedNode: SerializedCardNode): CardNode {
    return $createCardNode({
      title: serializedNode.title,
      description: serializedNode.description,
      imageUrl: serializedNode.imageUrl,
      imageAlt: serializedNode.imageAlt,
      linkUrl: serializedNode.linkUrl,
      linkText: serializedNode.linkText,
    }).updateFromJSON(serializedNode)
  }

  updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedCardNode>): this {
    return super.updateFromJSON(serializedNode)
  }

  exportJSON(): SerializedCardNode {
    return {
      ...super.exportJSON(),
      title: this.__title,
      description: this.__description,
      imageUrl: this.__imageUrl,
      imageAlt: this.__imageAlt,
      linkUrl: this.__linkUrl,
      linkText: this.__linkText,
    }
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute('data-card')) {
          return null
        }
        return {
          conversion: $convertCardElement,
          priority: 2,
        }
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const container = document.createElement('div')
    container.setAttribute('data-card', '')

    if (this.__imageUrl) {
      const img = document.createElement('img')
      img.setAttribute('src', this.__imageUrl)
      img.setAttribute('alt', this.__imageAlt || '')
      img.setAttribute('loading', 'lazy')
      container.appendChild(img)
    }

    if (this.__title) {
      const h3 = document.createElement('h3')
      h3.textContent = this.__title
      container.appendChild(h3)
    }

    if (this.__description) {
      const p = document.createElement('p')
      p.textContent = this.__description
      container.appendChild(p)
    }

    if (this.__linkUrl) {
      const a = document.createElement('a')
      a.setAttribute('href', this.__linkUrl)
      a.textContent = this.__linkText || '詳細を見る'
      container.appendChild(a)
    }

    return { element: container }
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'card-wrapper my-4'
    return div
  }

  updateDOM(): false {
    return false
  }

  getTitle(): string {
    return this.__title
  }

  getDescription(): string {
    return this.__description
  }

  getImageUrl(): string | undefined {
    return this.__imageUrl
  }

  getImageAlt(): string | undefined {
    return this.__imageAlt
  }

  getLinkUrl(): string | undefined {
    return this.__linkUrl
  }

  getLinkText(): string | undefined {
    return this.__linkText
  }

  setTitle(title: string): void {
    const writable = this.getWritable()
    writable.__title = title
  }

  setDescription(description: string): void {
    const writable = this.getWritable()
    writable.__description = description
  }

  setImageUrl(imageUrl: string | undefined): void {
    const writable = this.getWritable()
    writable.__imageUrl = imageUrl
  }

  setImageAlt(imageAlt: string | undefined): void {
    const writable = this.getWritable()
    writable.__imageAlt = imageAlt
  }

  setLinkUrl(linkUrl: string | undefined): void {
    const writable = this.getWritable()
    writable.__linkUrl = linkUrl
  }

  setLinkText(linkText: string | undefined): void {
    const writable = this.getWritable()
    writable.__linkText = linkText
  }

  decorate(): ReactElement {
    return (
      <Suspense
        fallback={
          <div className="animate-pulse bg-muted rounded-lg h-48 flex items-center justify-center">
            <span className="text-muted-foreground">読み込み中...</span>
          </div>
        }
      >
        <CardComponent
          nodeKey={this.__key}
          title={this.__title}
          description={this.__description}
          imageUrl={this.__imageUrl}
          imageAlt={this.__imageAlt}
          linkUrl={this.__linkUrl}
          linkText={this.__linkText}
        />
      </Suspense>
    )
  }
}

export function $createCardNode(options?: CardNodeOptions): CardNode {
  return $applyNodeReplacement(new CardNode(options))
}

export function $isCardNode(
  node: LexicalNode | null | undefined
): node is CardNode {
  return node instanceof CardNode
}
