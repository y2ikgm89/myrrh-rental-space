/**
 * Image Node
 *
 * 画像を表示するカスタムノード
 */

'use client'

import type { ReactElement } from 'react'
import {
  DecoratorNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical'
import { Suspense, lazy } from 'react'

const ImageComponent = lazy(() =>
  import('./ImageComponent').then((m) => ({ default: m.ImageComponent }))
)

export type SerializedImageNode = Spread<
  {
    src: string
    alt: string
    width?: number
    height?: number
  },
  SerializedLexicalNode
>

function $convertImageElement(domNode: HTMLElement): DOMConversionOutput | null {
  const img = domNode as HTMLImageElement
  const src = img.getAttribute('src')
  if (!src) {
    return null
  }
  const alt = img.getAttribute('alt') || ''
  const width = img.width || undefined
  const height = img.height || undefined
  const node = $createImageNode({ src, alt, width, height })
  return { node }
}

export class ImageNode extends DecoratorNode<ReactElement> {
  __src: string
  __alt: string
  __width?: number
  __height?: number

  static getType(): string {
    return 'image'
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(
      node.__src,
      node.__alt,
      node.__width,
      node.__height,
      node.__key
    )
  }

  constructor(
    src: string,
    alt: string = '',
    width?: number,
    height?: number,
    key?: NodeKey
  ) {
    super(key)
    this.__src = src
    this.__alt = alt
    this.__width = width
    this.__height = height
  }

  static importJSON(serializedNode: SerializedImageNode): ImageNode {
    return $createImageNode({
      src: serializedNode.src,
      alt: serializedNode.alt,
      width: serializedNode.width,
      height: serializedNode.height,
    })
  }

  exportJSON(): SerializedImageNode {
    return {
      type: 'image',
      version: 1,
      src: this.__src,
      alt: this.__alt,
      width: this.__width,
      height: this.__height,
    }
  }

  static importDOM(): DOMConversionMap | null {
    return {
      img: () => ({
        conversion: $convertImageElement,
        priority: 0,
      }),
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('img')
    element.setAttribute('src', this.__src)
    element.setAttribute('alt', this.__alt)
    if (this.__width) {
      element.setAttribute('width', String(this.__width))
    }
    if (this.__height) {
      element.setAttribute('height', String(this.__height))
    }
    element.setAttribute('loading', 'lazy')
    return { element }
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement('span')
    span.className = 'editor-image-wrapper'
    return span
  }

  updateDOM(): false {
    return false
  }

  getSrc(): string {
    return this.__src
  }

  getAlt(): string {
    return this.__alt
  }

  setSrc(src: string): void {
    const writable = this.getWritable()
    writable.__src = src
  }

  setAlt(alt: string): void {
    const writable = this.getWritable()
    writable.__alt = alt
  }

  setDimensions(width?: number, height?: number): void {
    const writable = this.getWritable()
    writable.__width = width
    writable.__height = height
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
        <ImageComponent
          nodeKey={this.__key}
          src={this.__src}
          alt={this.__alt}
          width={this.__width}
          height={this.__height}
        />
      </Suspense>
    )
  }
}

type ImageNodeOptions = {
  src: string
  alt?: string
  width?: number
  height?: number
}

export function $createImageNode({
  src,
  alt = '',
  width,
  height,
}: ImageNodeOptions): ImageNode {
  return new ImageNode(src, alt, width, height)
}

export function $isImageNode(
  node: LexicalNode | null | undefined
): node is ImageNode {
  return node instanceof ImageNode
}
