/**
 * MapEmbed Inspector Panel
 *
 * @description MapEmbedNode のプロパティ編集パネル
 */

'use client'

import { $getState, $setState } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $isMapEmbedNode, embedUrlState, mapLabelState } from '../../nodes/MapEmbedNode'
import type { MapEmbedNode } from '../../nodes/MapEmbedNode'
import { InspectorHeader } from '../InspectorHeader'
import { InspectorFields } from '../InspectorFields'
import { useNodeUpdater } from '../hooks/use-node-updater'
import { Input, Label } from '@/admin/components/ui'

// =============================================================================
// Types
// =============================================================================

type MapEmbedInspectorPanelProps = {
  nodeKey: string
  node: MapEmbedNode
}

// =============================================================================
// Component
// =============================================================================

export function MapEmbedInspectorPanel({ nodeKey, node }: MapEmbedInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()
  const updateNode = useNodeUpdater(nodeKey, $isMapEmbedNode)

  const { embedUrl, label } = editor.getEditorState().read(() => ({
    embedUrl: $getState(node, embedUrlState),
    label: $getState(node, mapLabelState),
  }))

  const handleLabelChange = (value: string) => {
    updateNode((n) => { $setState(n, mapLabelState, value) })
  }

  return (
    <div>
      <InspectorHeader title="Google マップ" />

      <InspectorFields title="基本設定">
        <div className="space-y-2">
          <Label className="text-xs">埋め込み URL</Label>
          <p className="text-xs text-muted-foreground truncate">{embedUrl}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="inspector-map-label" className="text-xs">
            ラベル
          </Label>
          <Input
            id="inspector-map-label"
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            placeholder="アクセスマップ"
            className="h-8 text-sm"
          />
        </div>
      </InspectorFields>
    </div>
  )
}
