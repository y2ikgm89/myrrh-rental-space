/**
 * FeatureIconListContainer Inspector Panel
 *
 * @description FeatureIconListContainerNodeのプロパティ編集パネル
 */

'use client'

import { $getState, $setState } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $isFeatureIconListContainerNode,
  type FeatureIconListContainerNode,
  type FeatureIconListColumns,
  type IconSize,
  ICON_SIZES,
  featureIconListColumnsState,
  featureIconListAccentColorState,
  featureIconListIconSizeState,
} from '../../nodes/FeatureIconListNode'
import { isAccentColor, ACCENT_COLORS, ACCENT_COLOR_LABELS } from '../../config/accent-colors'
import type { AccentColor } from '../../config/accent-colors'
import { InspectorHeader } from '../InspectorHeader'
import { InspectorSection } from '../InspectorSection'
import { useNodeUpdater } from '../hooks/use-node-updater'
import { Label } from '@/admin/components/ui'
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

const COLUMNS_OPTIONS: readonly { value: FeatureIconListColumns; label: string }[] = [
  { value: 1, label: '1列' },
  { value: 2, label: '2列' },
  { value: 3, label: '3列' },
]

const ICON_SIZE_LABELS: Record<IconSize, string> = {
  sm: '小 (sm)',
  md: '中 (md)',
  lg: '大 (lg)',
}

// =============================================================================
// Types
// =============================================================================

type FeatureIconListContainerInspectorPanelProps = {
  nodeKey: string
  node: FeatureIconListContainerNode
}

// =============================================================================
// Component
// =============================================================================

export function FeatureIconListContainerInspectorPanel({
  nodeKey,
  node,
}: FeatureIconListContainerInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()
  const updateNode = useNodeUpdater(nodeKey, $isFeatureIconListContainerNode)

  const { columns, accentColor, iconSize } = editor.getEditorState().read(() => ({
    columns: $getState(node, featureIconListColumnsState),
    accentColor: $getState(node, featureIconListAccentColorState),
    iconSize: $getState(node, featureIconListIconSizeState),
  }))

  const handleColumnsChange = (value: string) => {
    const parsed = parseInt(value, 10)
    if (parsed === 1 || parsed === 2 || parsed === 3) {
      updateNode((n) => {
        $setState(n, featureIconListColumnsState, parsed)
      })
    }
  }

  const handleColorChange = (value: string) => {
    if (isAccentColor(value)) {
      updateNode((n) => {
        $setState(n, featureIconListAccentColorState, value)
      })
    }
  }

  const handleIconSizeChange = (value: string) => {
    if (value === 'sm' || value === 'md' || value === 'lg') {
      updateNode((n) => {
        $setState(n, featureIconListIconSizeState, value)
      })
    }
  }

  const accentColorValue: AccentColor = isAccentColor(accentColor) ? accentColor : 'default'

  return (
    <div>
      <InspectorHeader title="設備・特徴リスト" />

      <InspectorSection title="レイアウト">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">カラム数</Label>
            <Select value={String(columns)} onValueChange={handleColumnsChange}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLUMNS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">アクセントカラー</Label>
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

          <div className="space-y-2">
            <Label className="text-xs">アイコンサイズ</Label>
            <Select value={iconSize} onValueChange={handleIconSizeChange}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ICON_SIZES.map((size) => (
                  <SelectItem key={size} value={size}>
                    {ICON_SIZE_LABELS[size]}
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
