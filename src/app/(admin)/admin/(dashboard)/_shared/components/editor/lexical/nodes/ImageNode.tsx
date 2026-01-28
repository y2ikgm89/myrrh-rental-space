/**
 * Image Node
 *
 * @description 画像を表示するDecoratorNode
 */

'use client'

import type { ReactElement } from 'react'
import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import { $applyNodeReplacement, DecoratorNode } from 'lexical'

// =============================================================================
// Types
// =============================================================================

export type SerializedImageNode = Spread<
  {
    src: string
    alt: string
    width?: number
    height?: number
  },
  SerializedLexicalNode
>

// =============================================================================
// Component
// =============================================================================

function ImageComponent({
  src,
  alt,
  width,
  height,
  nodeKey,
}: {
  src: string
  alt: string
  width?: number
  height?: number
  nodeKey: NodeKey
}) {
  return (
    <div
      data-lexical-node-key={nodeKey}
      className="relative my-4 flex justify-center"
    >
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="max-w-full h-auto rounded-lg"
        draggable={false}
      />
    </div>
  )
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertImageElement(domNode: Node): null | DOMConversionOutput {
  if (domNode instanceof HTMLImageElement) {
    const src = domNode.getAttribute('src')
    if (src) {
      const alt = domNode.getAttribute('alt') ?? ''
      const width = domNode.width || undefined
      const height = domNode.height || undefined
      const node = $createImageNode({ src, alt, width, height })
      return { node }
    }
  }
  return null
}

// =============================================================================
// Node Class
// =============================================================================

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

  static importJSON(serializedNode: SerializedImageNode): ImageNode {
    return $createImageNode({
      src: serializedNode.src,
      alt: serializedNode.alt,
      width: serializedNode.width,
      height: serializedNode.height,
    })
  }

  static importDOM(): DOMConversionMap | null {
    return {
      img: () => ({
        conversion: $convertImageElement,
        priority: 0,
      }),
    }
  }

  constructor(
    src: string,
    alt: string,
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

  exportJSON(): SerializedImageNode {
    return {
      ...super.exportJSON(),
      type: 'image',
      src: this.__src,
      alt: this.__alt,
      width: this.__width,
      height: this.__height,
    }
  }

  exportDOM(): DOMExportOutput {
    const img = document.createElement('img')
    img.setAttribute('src', this.__src)
    img.setAttribute('alt', this.__alt)
    if (this.__width) {
      img.setAttribute('width', String(this.__width))
    }
    if (this.__height) {
      img.setAttribute('height', String(this.__height))
    }
    img.className = 'max-w-full h-auto rounded-lg my-4'
    return { element: img }
  }

  createDOM(config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    const theme = config.theme
    const className = theme.image
    if (className) {
      div.className = className
    }
    return div
  }

  updateDOM(): false {
    return false
  }

  decorate(): ReactElement {
    return (
      <ImageComponent
        src={this.__src}
        alt={this.__alt}
        width={this.__width}
        height={this.__height}
        nodeKey={this.__key}
      />
    )
  }

  // Getters
  getSrc(): string {
    return this.getLatest().__src
  }

  getAlt(): string {
    return this.getLatest().__alt
  }

  getWidth(): number | undefined {
    return this.getLatest().__width
  }

  getHeight(): number | undefined {
    return this.getLatest().__height
  }

  // Setters
  setAlt(alt: string): void {
    const self = this.getWritable()
    self.__alt = alt
  }

  setWidth(width: number | undefined): void {
    const self = this.getWritable()
    self.__width = width
  }

  setHeight(height: number | undefined): void {
    const self = this.getWritable()
    self.__height = height
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * 画像ノードを作成する
 *
 * @param params - 画像のパラメータ
 * @returns ImageNode インスタンス
 */
export function $createImageNode({
  src,
  alt = '',
  width,
  height,
}: {
  src: string
  alt?: string
  width?: number
  height?: number
}): ImageNode {
  return $applyNodeReplacement(new ImageNode(src, alt, width, height))
}

/**
 * ノードがImageNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns ImageNodeの場合true
 */
export function $isImageNode(
  node: LexicalNode | null | undefined
): node is ImageNode {
  return node instanceof ImageNode
}
