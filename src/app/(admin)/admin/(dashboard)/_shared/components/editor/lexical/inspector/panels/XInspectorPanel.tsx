/**
 * X (Twitter) Inspector Panel
 *
 * @description XNodeの情報表示パネル（読み取り専用）
 */

'use client'

import type { XNode } from '../../nodes/XNode'
import { tweetIdState } from '../../nodes/XNode'
import { EmbedInspectorPanel } from './EmbedInspectorPanel'

type XInspectorPanelProps = {
  nodeKey: string
  node: XNode
}

export function XInspectorPanel({ nodeKey, node }: XInspectorPanelProps) {
  return (
    <EmbedInspectorPanel
      nodeKey={nodeKey}
      node={node}
      title="X (Twitter)"
      idLabel="ツイートID"
      idState={tweetIdState}
      buildUrl={(id) => `https://x.com/i/status/${id}`}
    />
  )
}
