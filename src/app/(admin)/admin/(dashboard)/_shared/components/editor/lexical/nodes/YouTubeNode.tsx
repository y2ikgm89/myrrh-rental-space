/**
 * YouTube Node
 *
 * @description YouTube動画を埋め込むDecoratorNode
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
} from 'lexical'
import { $applyNodeReplacement, DecoratorNode } from 'lexical'

// =============================================================================
// Types
// =============================================================================

export interface SerializedYouTubeNode extends SerializedLexicalNode {
  videoId: string
}

// =============================================================================
// Component
// =============================================================================

function YouTubeComponent({
  videoId,
  nodeKey,
}: {
  videoId: string
  nodeKey: NodeKey
}) {
  return (
    <div
      data-lexical-node-key={nodeKey}
      className="relative my-4 aspect-video w-full max-w-3xl mx-auto"
    >
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        title="YouTube video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 w-full h-full rounded-lg"
      />
    </div>
  )
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertYouTubeElement(domNode: Node): null | DOMConversionOutput {
  if (domNode instanceof HTMLIFrameElement) {
    const src = domNode.getAttribute('src')
    if (src) {
      const match = src.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/)
      if (match?.[1]) {
        const node = $createYouTubeNode({ videoId: match[1] })
        return { node }
      }
    }
  }
  return null
}

// =============================================================================
// Node Class
// =============================================================================

export class YouTubeNode extends DecoratorNode<ReactElement> {
  __videoId: string

  static getType(): string {
    return 'youtube'
  }

  static clone(node: YouTubeNode): YouTubeNode {
    return new YouTubeNode(node.__videoId, node.__key)
  }

  static importJSON(serializedNode: SerializedYouTubeNode): YouTubeNode {
    return $createYouTubeNode({ videoId: serializedNode.videoId }).updateFromJSON(serializedNode)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      iframe: () => ({
        conversion: $convertYouTubeElement,
        priority: 0,
      }),
    }
  }

  constructor(videoId: string, key?: NodeKey) {
    super(key)
    this.__videoId = videoId
  }

  exportJSON(): SerializedYouTubeNode {
    return {
      ...super.exportJSON(),
      videoId: this.__videoId,
    }
  }

  exportDOM(): DOMExportOutput {
    const div = document.createElement('div')
    div.className = 'aspect-video w-full max-w-3xl mx-auto my-4'

    const iframe = document.createElement('iframe')
    iframe.setAttribute('src', `https://www.youtube.com/embed/${this.__videoId}`)
    iframe.setAttribute('title', 'YouTube video')
    iframe.setAttribute(
      'allow',
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
    )
    iframe.setAttribute('allowfullscreen', '')
    iframe.className = 'w-full h-full rounded-lg'

    div.appendChild(iframe)
    return { element: div }
  }

  createDOM(config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    const theme = config.theme
    const className = theme.youtube
    if (className) {
      div.className = className
    }
    return div
  }

  updateDOM(): false {
    return false
  }

  decorate(): ReactElement {
    return <YouTubeComponent videoId={this.__videoId} nodeKey={this.__key} />
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * YouTubeノードを作成する
 *
 * @param params - YouTubeのパラメータ
 * @returns YouTubeNode インスタンス
 */
export function $createYouTubeNode({
  videoId,
}: {
  videoId: string
}): YouTubeNode {
  return $applyNodeReplacement(new YouTubeNode(videoId))
}

/**
 * ノードがYouTubeNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns YouTubeNodeの場合true
 */
export function $isYouTubeNode(
  node: LexicalNode | null | undefined
): node is YouTubeNode {
  return node instanceof YouTubeNode
}
