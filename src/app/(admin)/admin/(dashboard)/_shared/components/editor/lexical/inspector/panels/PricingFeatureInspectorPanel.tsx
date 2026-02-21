/**
 * Pricing Feature Inspector Panel
 *
 * @description PricingFeatureNodeのプロパティ編集パネル
 */

'use client'

import { $getState, $setState } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $isPricingFeatureNode,
  type PricingFeatureNode,
  featureIncludedState,
} from '../../nodes/PricingTableNode'
import { InspectorHeader } from '../InspectorHeader'
import { InspectorSection } from '../InspectorSection'
import { useNodeUpdater } from '../hooks/use-node-updater'
import { Label, Switch } from '@/admin/components/ui'

// =============================================================================
// Types
// =============================================================================

type PricingFeatureInspectorPanelProps = {
  nodeKey: string
  node: PricingFeatureNode
}

// =============================================================================
// Component
// =============================================================================

export function PricingFeatureInspectorPanel({ nodeKey, node }: PricingFeatureInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()
  const updateNode = useNodeUpdater(nodeKey, $isPricingFeatureNode)

  const { included } = editor.getEditorState().read(() => ({
    included: $getState(node, featureIncludedState),
  }))

  const handleIncludedChange = (checked: boolean) => {
    updateNode((n) => { $setState(n, featureIncludedState, checked) })
  }

  return (
    <div>
      <InspectorHeader title="料金機能項目" />

      <InspectorSection title="表示設定">
        <div className="flex items-center justify-between">
          <Label htmlFor="inspector-feature-included" className="text-xs">含まれる</Label>
          <Switch
            id="inspector-feature-included"
            checked={included}
            onCheckedChange={handleIncludedChange}
          />
        </div>
      </InspectorSection>
    </div>
  )
}
