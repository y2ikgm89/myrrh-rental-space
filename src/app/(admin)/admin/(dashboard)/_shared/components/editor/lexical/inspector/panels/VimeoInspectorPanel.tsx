/**
 * Vimeo Inspector Panel
 *
 * @description VimeoNodeの情報表示パネル（読み取り専用）
 */

'use client'

import type { VimeoNode } from '../../nodes/VimeoNode'
import { vimeoVideoIdState } from '../../nodes/VimeoNode'
import { EmbedInspectorPanel } from './EmbedInspectorPanel'

type VimeoInspectorPanelProps = {
  nodeKey: string
  node: VimeoNode
}

export function VimeoInspectorPanel({ nodeKey, node }: VimeoInspectorPanelProps) {
  return (
    <EmbedInspectorPanel
      nodeKey={nodeKey}
      node={node}
      title="Vimeo 動画"
      idLabel="Video ID"
      idState={vimeoVideoIdState}
      buildUrl={(id) => `https://player.vimeo.com/video/${id}`}
    />
  )
}
