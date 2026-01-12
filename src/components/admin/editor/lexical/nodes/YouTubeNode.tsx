/**
 * YouTube Node
 *
 * YouTube動画を埋め込むカスタムノード
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

const YouTubeComponent = lazy(() =>
  import('./YouTubeComponent').then((m) => ({ default: m.YouTubeComponent }))
)

export type SerializedYouTubeNode = Spread<
  {
    videoId: string
    width?: number
    height?: number
  },
  SerializedLexicalNode
>

function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?\s]+)/,
    /^([a-zA-Z0-9_-]{11})$/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) {
      return match[1]
    }
  }
  return null
}

function $convertYouTubeElement(
  domNode: HTMLElement
): DOMConversionOutput | null {
  const iframe = domNode as HTMLIFrameElement
  const src = iframe.getAttribute('src')
  if (!src) {
    return null
  }
  const videoId = extractYouTubeVideoId(src)
  if (!videoId) {
    return null
  }
  const width = iframe.width ? parseInt(iframe.width, 10) : undefined
  const height = iframe.height ? parseInt(iframe.height, 10) : undefined
  const node = $createYouTubeNode(videoId, width, height)
  return { node }
}

export class YouTubeNode extends DecoratorNode<ReactElement> {
  __videoId: string
  __width: number
  __height: number

  static getType(): string {
    return 'youtube'
  }

  static clone(node: YouTubeNode): YouTubeNode {
    return new YouTubeNode(
      node.__videoId,
      node.__width,
      node.__height,
      node.__key
    )
  }

  constructor(
    videoId: string,
    width: number = 560,
    height: number = 315,
    key?: NodeKey
  ) {
    super(key)
    this.__videoId = videoId
    this.__width = width
    this.__height = height
  }

  static importJSON(serializedNode: SerializedYouTubeNode): YouTubeNode {
    return $createYouTubeNode(
      serializedNode.videoId,
      serializedNode.width,
      serializedNode.height
    )
  }

  exportJSON(): SerializedYouTubeNode {
    return {
      type: 'youtube',
      version: 1,
      videoId: this.__videoId,
      width: this.__width,
      height: this.__height,
    }
  }

  static importDOM(): DOMConversionMap | null {
    return {
      iframe: (domNode: HTMLElement) => {
        const src = domNode.getAttribute('src') || ''
        if (!src.includes('youtube.com') && !src.includes('youtu.be')) {
          return null
        }
        return {
          conversion: $convertYouTubeElement,
          priority: 1,
        }
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('iframe')
    element.setAttribute(
      'src',
      `https://www.youtube.com/embed/${this.__videoId}`
    )
    element.setAttribute('width', String(this.__width))
    element.setAttribute('height', String(this.__height))
    element.setAttribute('frameborder', '0')
    element.setAttribute(
      'allow',
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
    )
    element.setAttribute('allowfullscreen', '')
    element.setAttribute('loading', 'lazy')
    return { element }
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    div.className = 'youtube-wrapper my-4'
    return div
  }

  updateDOM(): false {
    return false
  }

  getVideoId(): string {
    return this.__videoId
  }

  getWidth(): number {
    return this.__width
  }

  getHeight(): number {
    return this.__height
  }

  setDimensions(width: number, height: number): void {
    const writable = this.getWritable()
    writable.__width = width
    writable.__height = height
  }

  decorate(): ReactElement {
    return (
      <Suspense
        fallback={
          <div className="animate-pulse bg-muted rounded-lg aspect-video flex items-center justify-center">
            <span className="text-muted-foreground">読み込み中...</span>
          </div>
        }
      >
        <YouTubeComponent
          nodeKey={this.__key}
          videoId={this.__videoId}
          width={this.__width}
          height={this.__height}
        />
      </Suspense>
    )
  }
}

export function $createYouTubeNode(
  videoId: string,
  width?: number,
  height?: number
): YouTubeNode {
  return new YouTubeNode(videoId, width || 560, height || 315)
}

export function $isYouTubeNode(
  node: LexicalNode | null | undefined
): node is YouTubeNode {
  return node instanceof YouTubeNode
}

export { extractYouTubeVideoId }
