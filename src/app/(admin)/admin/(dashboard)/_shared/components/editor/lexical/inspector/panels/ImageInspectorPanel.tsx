/**
 * Image Inspector Panel
 *
 * @description ImageNodeのプロパティ編集パネル
 */

'use client'

import { useCallback } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'
import { $isImageNode, type ImageNode } from '../../nodes/ImageNode'
import { InspectorSection } from '../InspectorSection'
import { Input, Label } from '@/admin/components/ui'

// =============================================================================
// Types
// =============================================================================

type ImageInspectorPanelProps = {
  nodeKey: string
  node: ImageNode
}

// =============================================================================
// Component
// =============================================================================

export function ImageInspectorPanel({ nodeKey, node }: ImageInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()

  // 現在の値を取得
  const src = node.getSrc()
  const alt = node.getAlt()
  const width = node.getWidth()
  const height = node.getHeight()

  // 更新ヘルパー
  const updateNode = useCallback(
    (updater: (node: ImageNode) => void) => {
      editor.update(() => {
        const targetNode = $getNodeByKey(nodeKey)
        if ($isImageNode(targetNode)) {
          updater(targetNode)
        }
      })
    },
    [editor, nodeKey]
  )

  const handleAltChange = useCallback(
    (value: string) => updateNode((n) => n.setAlt(value)),
    [updateNode]
  )

  const handleWidthChange = useCallback(
    (value: string) => {
      const numValue = value ? parseInt(value, 10) : undefined
      updateNode((n) => n.setWidth(numValue))
    },
    [updateNode]
  )

  const handleHeightChange = useCallback(
    (value: string) => {
      const numValue = value ? parseInt(value, 10) : undefined
      updateNode((n) => n.setHeight(numValue))
    },
    [updateNode]
  )

  return (
    <div>
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm">画像</h3>
      </div>

      <InspectorSection title="基本設定">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">URL</Label>
            <p className="text-xs text-muted-foreground truncate">{src}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inspector-image-alt" className="text-xs">
              代替テキスト（ALT）
            </Label>
            <Input
              id="inspector-image-alt"
              value={alt}
              onChange={(e) => handleAltChange(e.target.value)}
              placeholder="画像の説明"
              className="h-8 text-sm"
            />
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="サイズ" defaultOpen={false}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inspector-image-width" className="text-xs">
                幅（px）
              </Label>
              <Input
                id="inspector-image-width"
                type="number"
                value={width ?? ''}
                onChange={(e) => handleWidthChange(e.target.value)}
                placeholder="自動"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inspector-image-height" className="text-xs">
                高さ（px）
              </Label>
              <Input
                id="inspector-image-height"
                type="number"
                value={height ?? ''}
                onChange={(e) => handleHeightChange(e.target.value)}
                placeholder="自動"
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>
      </InspectorSection>
    </div>
  )
}
