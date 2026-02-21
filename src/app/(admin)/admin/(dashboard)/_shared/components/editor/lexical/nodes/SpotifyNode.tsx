/**
 * Spotify Node
 *
 * @description Spotify の音楽・Podcast 埋め込みを表示する DecoratorNode
 */

'use client'

import type { ReactElement } from 'react'
import type { DOMExportOutput, EditorConfig, NodeKey } from 'lexical'
import { $create, $getState, $setState, createState, DecoratorNode } from 'lexical'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'

// =============================================================================
// Constants & Types
// =============================================================================

export type SpotifyContentType = 'track' | 'album' | 'playlist' | 'episode' | 'show'

const SPOTIFY_CONTENT_TYPES: readonly SpotifyContentType[] = [
  'track',
  'album',
  'playlist',
  'episode',
  'show',
]

// =============================================================================
// URL Converter
// =============================================================================

export function toSpotifyEmbedUrl(
  url: string,
): { embedUrl: string; contentType: SpotifyContentType } | null {
  try {
    const u = new URL(url)
    if (!u.hostname.includes('spotify.com')) return null
    const parts = u.pathname.split('/').filter(Boolean)
    const typeIndex = parts.findIndex((p) =>
      SPOTIFY_CONTENT_TYPES.find((t) => t === p) !== undefined,
    )
    if (typeIndex === -1) return null
    const id = parts[typeIndex + 1]
    if (!id) return null
    const rawType = parts[typeIndex]
    const contentType = SPOTIFY_CONTENT_TYPES.find((t) => t === rawType)
    if (!contentType) return null
    return {
      embedUrl: `https://open.spotify.com/embed/${contentType}/${id}`,
      contentType,
    }
  } catch {
    return null
  }
}

// =============================================================================
// State
// =============================================================================

export const spotifyEmbedUrlState = createState('embedUrl', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : ''),
})

export const spotifyContentTypeState = createState('contentType', {
  parse: (v: unknown): SpotifyContentType =>
    SPOTIFY_CONTENT_TYPES.find((t) => t === v) ?? 'track',
})

// =============================================================================
// Component
// =============================================================================

const CONTENT_TYPE_LABELS: Record<SpotifyContentType, string> = {
  track: 'トラック',
  album: 'アルバム',
  playlist: 'プレイリスト',
  episode: 'エピソード',
  show: 'ポッドキャスト',
}

function SpotifyComponent({
  embedUrl,
  contentType,
  nodeKey,
}: {
  embedUrl: string
  contentType: SpotifyContentType
  nodeKey: NodeKey
}) {
  const [isSelected, setSelected] = useLexicalNodeSelection(nodeKey)

  return (
    <div
      className={`my-2 ${isSelected ? 'ring-2 ring-ring rounded-xl' : ''}`}
      onClick={() => setSelected(true)}
    >
      <iframe
        src={embedUrl}
        allow="encrypted-media"
        loading="lazy"
        title={`Spotify ${CONTENT_TYPE_LABELS[contentType]}`}
        className="w-full border-none rounded-xl"
        style={{ height: '352px' }}
      />
    </div>
  )
}

// =============================================================================
// Node Class
// =============================================================================

export class SpotifyNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config('spotify', {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: spotifyEmbedUrlState },
        { flat: true, stateConfig: spotifyContentTypeState },
      ],
    })
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    div.setAttribute('data-lexical-spotify', 'true')
    return div
  }

  override updateDOM(): false {
    return false
  }

  override exportDOM(): DOMExportOutput {
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-spotify', 'true')
    wrapper.setAttribute('data-spotify-type', $getState(this, spotifyContentTypeState))
    const iframe = document.createElement('iframe')
    iframe.setAttribute('src', $getState(this, spotifyEmbedUrlState))
    iframe.setAttribute('allow', 'encrypted-media')
    iframe.setAttribute('loading', 'lazy')
    iframe.style.width = '100%'
    iframe.style.height = '352px'
    iframe.style.border = 'none'
    iframe.style.borderRadius = '12px'
    wrapper.appendChild(iframe)
    return { element: wrapper }
  }

  override decorate(): ReactElement {
    return (
      <SpotifyComponent
        embedUrl={$getState(this, spotifyEmbedUrlState)}
        contentType={$getState(this, spotifyContentTypeState)}
        nodeKey={this.__key}
      />
    )
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * SpotifyNode を作成する
 *
 * @param params - Spotify 埋め込みパラメータ
 * @returns SpotifyNode インスタンス
 */
export function $createSpotifyNode(params: {
  embedUrl: string
  contentType: SpotifyContentType
}): SpotifyNode {
  const node = $create(SpotifyNode)
  $setState(node, spotifyEmbedUrlState, params.embedUrl)
  $setState(node, spotifyContentTypeState, params.contentType)
  return node
}

/**
 * ノードが SpotifyNode かどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns SpotifyNode の場合 true
 */
export function $isSpotifyNode(node: unknown): node is SpotifyNode {
  return node instanceof SpotifyNode
}
