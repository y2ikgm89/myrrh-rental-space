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
} from 'lexical'
import { $create, $getState, $setState, createState, DecoratorNode } from 'lexical'

// =============================================================================
// State
// =============================================================================

export const videoIdState = createState('videoId', {
  parse: (v: unknown): string => typeof v === 'string' ? v : '',
})

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
      className="relative my-6 aspect-video w-full max-w-3xl mx-auto"
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

function $convertYouTubeElement(element: HTMLElement): null | DOMConversionOutput {
  if (element instanceof HTMLIFrameElement) {
    const src = element.getAttribute('src')
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
  override $config() {
    return this.config('youtube', {
      extends: DecoratorNode,
      stateConfigs: [{ flat: true, stateConfig: videoIdState }],
    })
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      iframe: () => ({
        conversion: $convertYouTubeElement,
        priority: 0,
      }),
    }
  }

  override exportDOM(): DOMExportOutput {
    const videoId = $getState(this, videoIdState)
    const div = document.createElement('div')
    div.setAttribute('data-youtube', 'true')

    const iframe = document.createElement('iframe')
    iframe.setAttribute('src', `https://www.youtube.com/embed/${videoId}`)
    iframe.setAttribute('title', 'YouTube video')
    iframe.setAttribute(
      'allow',
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
    )
    iframe.setAttribute('allowfullscreen', '')

    div.appendChild(iframe)
    return { element: div }
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    div.setAttribute('data-youtube', 'true')
    return div
  }

  override updateDOM(): false {
    return false
  }

  override decorate(): ReactElement {
    return <YouTubeComponent videoId={$getState(this, videoIdState)} nodeKey={this.__key} />
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
  return $setState($create(YouTubeNode), videoIdState, videoId)
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
