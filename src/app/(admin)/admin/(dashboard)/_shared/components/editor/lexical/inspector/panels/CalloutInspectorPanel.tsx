/**
 * Callout Inspector Panel
 *
 * @description CalloutNodeのプロパティ編集パネル
 */

'use client'

import { useCallback } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'
import {
  $isCalloutNode,
  type CalloutNode,
  type CalloutType,
  CALLOUT_TYPES,
} from '../../nodes/CalloutNode'
import { InspectorSection } from '../InspectorSection'
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
// Type Guard
// =============================================================================

function isCalloutType(value: string): value is CalloutType {
  return (CALLOUT_TYPES as readonly string[]).includes(value)
}

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
  const [editor] = useLexicalComposerContext()

  const calloutType = node.getCalloutType()

  const handleTypeChange = useCallback(
    (value: string) => {
      if (!isCalloutType(value)) return

      editor.update(() => {
        const targetNode = $getNodeByKey(nodeKey)
        if ($isCalloutNode(targetNode)) {
          targetNode.setCalloutType(value)
        }
      })
    },
    [editor, nodeKey]
  )

  return (
    <div>
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm">コールアウト</h3>
      </div>

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
