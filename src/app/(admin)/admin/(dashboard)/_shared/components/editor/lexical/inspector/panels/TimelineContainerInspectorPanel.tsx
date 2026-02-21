/**
 * Timeline Container Inspector Panel
 *
 * @description TimelineContainerNodeのプロパティ編集パネル
 */

'use client'

import { $getState, $setState } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $isTimelineContainerNode,
  type TimelineContainerNode,
  type TimelineDirection,
  timelineDirectionState,
  timelineColorState,
} from '../../nodes/TimelineNode'
import { isAccentColor, ACCENT_COLORS, ACCENT_COLOR_LABELS } from '../../config/accent-colors'
import type { AccentColor } from '../../config/accent-colors'
import { InspectorHeader } from '../InspectorHeader'
import { InspectorSection } from '../InspectorSection'
import { useNodeUpdater } from '../hooks/use-node-updater'
import { Label } from '@/admin/components/ui'
import {
  RadioGroup,
  RadioGroupItem,
} from '@/admin/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui/select'

// =============================================================================
// Constants
// =============================================================================

const DIRECTION_OPTIONS: readonly { value: TimelineDirection; label: string }[] = [
  { value: 'vertical', label: '縦（垂直）' },
  { value: 'horizontal', label: '横（水平）' },
]

// =============================================================================
// Types
// =============================================================================

type TimelineContainerInspectorPanelProps = {
  nodeKey: string
  node: TimelineContainerNode
}

// =============================================================================
// Component
// =============================================================================

export function TimelineContainerInspectorPanel({ nodeKey, node }: TimelineContainerInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()
  const updateNode = useNodeUpdater(nodeKey, $isTimelineContainerNode)

  const { direction, color } = editor.getEditorState().read(() => ({
    direction: $getState(node, timelineDirectionState),
    color: $getState(node, timelineColorState),
  }))

  const handleDirectionChange = (value: string) => {
    if (value === 'vertical' || value === 'horizontal') {
      updateNode((n) => { $setState(n, timelineDirectionState, value) })
    }
  }

  const handleColorChange = (value: string) => {
    if (isAccentColor(value)) {
      updateNode((n) => { $setState(n, timelineColorState, value) })
    }
  }

  const accentColorValue: AccentColor = isAccentColor(color) ? color : 'default'

  return (
    <div>
      <InspectorHeader title="タイムライン" />

      <InspectorSection title="レイアウト">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">方向</Label>
            <RadioGroup
              value={direction}
              onValueChange={handleDirectionChange}
              className="flex gap-3"
            >
              {DIRECTION_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <RadioGroupItem
                    value={option.value}
                    id={`inspector-timeline-direction-${option.value}`}
                  />
                  <Label
                    htmlFor={`inspector-timeline-direction-${option.value}`}
                    className="text-xs font-normal cursor-pointer"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">カラー</Label>
            <Select value={accentColorValue} onValueChange={handleColorChange}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCENT_COLORS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {ACCENT_COLOR_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </InspectorSection>
    </div>
  )
}
