/**
 * Spotify Inspector Panel
 *
 * @description SpotifyNode の情報表示パネル（読み取り専用）
 */

'use client'

import { $getState } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { spotifyEmbedUrlState, spotifyContentTypeState } from '../../nodes/SpotifyNode'
import type { SpotifyNode } from '../../nodes/SpotifyNode'
import type { SpotifyContentType } from '../../nodes/SpotifyNode'
import { InspectorHeader } from '../InspectorHeader'
import { InspectorFields } from '../InspectorFields'
import { Label } from '@/admin/components/ui'

// =============================================================================
// Types
// =============================================================================

type SpotifyInspectorPanelProps = {
  nodeKey: string
  node: SpotifyNode
}

// =============================================================================
// Constants
// =============================================================================

const CONTENT_TYPE_LABELS: Record<SpotifyContentType, string> = {
  track: 'トラック',
  album: 'アルバム',
  playlist: 'プレイリスト',
  episode: 'エピソード',
  show: 'ポッドキャスト',
}

// =============================================================================
// Component
// =============================================================================

export function SpotifyInspectorPanel({ node }: SpotifyInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()

  const { embedUrl, contentType } = editor.getEditorState().read(() => ({
    embedUrl: $getState(node, spotifyEmbedUrlState),
    contentType: $getState(node, spotifyContentTypeState),
  }))

  return (
    <div>
      <InspectorHeader title="Spotify" />

      <InspectorFields title="基本設定">
        <div className="space-y-2">
          <Label className="text-xs">コンテンツタイプ</Label>
          <p className="text-xs text-muted-foreground">{CONTENT_TYPE_LABELS[contentType]}</p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">埋め込み URL</Label>
          <p className="text-xs text-muted-foreground truncate">{embedUrl}</p>
        </div>
      </InspectorFields>
    </div>
  )
}
