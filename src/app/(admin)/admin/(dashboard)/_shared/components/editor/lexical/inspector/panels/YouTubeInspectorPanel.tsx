/**
 * YouTube Inspector Panel
 *
 * @description YouTubeNodeの情報表示パネル（読み取り専用）
 */

'use client'

import type { YouTubeNode } from '../../nodes/YouTubeNode'
import { videoIdState } from '../../nodes/YouTubeNode'
import { EmbedInspectorPanel } from './EmbedInspectorPanel'

type YouTubeInspectorPanelProps = {
  nodeKey: string
  node: YouTubeNode
}

export function YouTubeInspectorPanel({ nodeKey, node }: YouTubeInspectorPanelProps) {
  return (
    <EmbedInspectorPanel
      nodeKey={nodeKey}
      node={node}
      title="YouTube"
      idLabel="動画ID"
      idState={videoIdState}
      buildUrl={(id) => `https://www.youtube.com/watch?v=${id}`}
    />
  )
}
