/**
 * Gallery Container Inspector Panel
 *
 * @description GalleryContainerNodeのプロパティ編集パネル
 */

'use client'

import { $getState, $setState } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $isGalleryContainerNode,
  type GalleryContainerNode,
  type GalleryColumns,
  type GalleryStyle,
  galleryColumnsState,
  galleryStyleState,
} from '../../nodes/GalleryNode'
import { InspectorHeader } from '../InspectorHeader'
import { InspectorSection } from '../InspectorSection'
import { useNodeUpdater } from '../hooks/use-node-updater'
import { Label } from '@/admin/components/ui'
import {
  RadioGroup,
  RadioGroupItem,
} from '@/admin/components/ui/radio-group'

// =============================================================================
// Constants
// =============================================================================

const COLUMN_OPTIONS: readonly { value: GalleryColumns; label: string }[] = [
  { value: 2, label: '2列' },
  { value: 3, label: '3列' },
  { value: 4, label: '4列' },
]

const STYLE_OPTIONS: readonly { value: GalleryStyle; label: string }[] = [
  { value: 'grid', label: 'グリッド' },
  { value: 'masonry', label: 'メイソンリー' },
]

// =============================================================================
// Types
// =============================================================================

type GalleryContainerInspectorPanelProps = {
  nodeKey: string
  node: GalleryContainerNode
}

// =============================================================================
// Component
// =============================================================================

export function GalleryContainerInspectorPanel({ nodeKey, node }: GalleryContainerInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()
  const updateNode = useNodeUpdater(nodeKey, $isGalleryContainerNode)

  const { columns, galleryStyle } = editor.getEditorState().read(() => ({
    columns: $getState(node, galleryColumnsState),
    galleryStyle: $getState(node, galleryStyleState),
  }))

  const handleColumnsChange = (value: string) => {
    const num = parseInt(value, 10)
    if (num === 2 || num === 3 || num === 4) {
      updateNode((n) => { $setState(n, galleryColumnsState, num) })
    }
  }

  const handleStyleChange = (value: string) => {
    if (value === 'grid' || value === 'masonry') {
      updateNode((n) => { $setState(n, galleryStyleState, value) })
    }
  }

  return (
    <div>
      <InspectorHeader title="画像ギャラリー" />

      <InspectorSection title="レイアウト">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">列数</Label>
            <RadioGroup
              value={String(columns)}
              onValueChange={handleColumnsChange}
              className="flex gap-3"
            >
              {COLUMN_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <RadioGroupItem
                    value={String(option.value)}
                    id={`inspector-gallery-columns-${option.value}`}
                  />
                  <Label
                    htmlFor={`inspector-gallery-columns-${option.value}`}
                    className="text-xs font-normal cursor-pointer"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">スタイル</Label>
            <RadioGroup
              value={galleryStyle}
              onValueChange={handleStyleChange}
              className="flex gap-3"
            >
              {STYLE_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <RadioGroupItem
                    value={option.value}
                    id={`inspector-gallery-style-${option.value}`}
                  />
                  <Label
                    htmlFor={`inspector-gallery-style-${option.value}`}
                    className="text-xs font-normal cursor-pointer"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>
      </InspectorSection>
    </div>
  )
}
