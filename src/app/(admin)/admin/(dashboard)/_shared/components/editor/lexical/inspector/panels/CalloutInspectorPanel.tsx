/**
 * Callout Inspector Panel
 *
 * @description CalloutNodeのプロパティ編集パネル
 */

'use client'

import { useCallback } from 'react'
import { $isCalloutNode, type CalloutNode, isCalloutType } from '../../nodes/CalloutNode'
import { InspectorHeader } from '../InspectorHeader'
import { InspectorSection } from '../InspectorSection'
import { useNodeUpdater } from '../hooks/use-node-updater'
import { Label, SelectionBox } from '@/admin/components/ui'

// =============================================================================
// Options
// =============================================================================

const CALLOUT_OPTIONS = [
  { value: 'info', label: '情報' },
  { value: 'warning', label: '注意' },
  { value: 'error', label: 'エラー' },
  { value: 'success', label: '成功' },
]

// =============================================================================
// Types
// =============================================================================

type CalloutInspectorPanelProps = {
  nodeKey: string
  node: CalloutNode
}

// =============================================================================
// Component
// =============================================================================

export function CalloutInspectorPanel({ nodeKey, node }: CalloutInspectorPanelProps) {
  const updateNode = useNodeUpdater(nodeKey, $isCalloutNode)
  const calloutType = node.getCalloutType()

  const handleTypeChange = useCallback(
    (value: string) => {
      if (isCalloutType(value)) {
        updateNode((n) => n.setCalloutType(value))
      }
    },
    [updateNode]
  )

  return (
    <div>
      <InspectorHeader title="コールアウト" />

      <InspectorSection title="スタイル">
        <div className="space-y-1.5">
          <Label className="text-xs">種類</Label>
          <SelectionBox
            options={CALLOUT_OPTIONS}
            value={calloutType}
            onChange={handleTypeChange}
            columns={2}
            name="コールアウト種類"
          />
        </div>
      </InspectorSection>
    </div>
  )
}
