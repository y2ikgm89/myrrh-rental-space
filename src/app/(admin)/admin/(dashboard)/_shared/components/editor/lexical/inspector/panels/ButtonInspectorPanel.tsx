/**
 * Button Inspector Panel
 *
 * @description ButtonNodeのプロパティ編集パネル
 */

'use client'

import { useCallback } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'
import {
  $isButtonNode,
  type ButtonNode,
  isButtonVariant,
  isButtonSize,
  isButtonAlignment,
} from '../../nodes/ButtonNode'
import { InspectorSection } from '../InspectorSection'
import { Input, Label, SelectionBox, Switch } from '@/admin/components/ui'

// =============================================================================
// Options
// =============================================================================

const VARIANT_OPTIONS = [
  { value: 'primary', label: 'プライマリ' },
  { value: 'secondary', label: 'セカンダリ' },
  { value: 'outline', label: 'アウトライン' },
]

const SIZE_OPTIONS = [
  { value: 'sm', label: '小' },
  { value: 'md', label: '中' },
  { value: 'lg', label: '大' },
]

const ALIGNMENT_OPTIONS = [
  { value: 'left', label: '左' },
  { value: 'center', label: '中央' },
  { value: 'right', label: '右' },
]

// =============================================================================
// Types
// =============================================================================

type ButtonInspectorPanelProps = {
  nodeKey: string
  node: ButtonNode
}

// =============================================================================
// Component
// =============================================================================

export function ButtonInspectorPanel({ nodeKey, node }: ButtonInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()

  // 現在の値を取得
  const text = node.getText()
  const href = node.getHref()
  const variant = node.getVariant()
  const size = node.getSize()
  const alignment = node.getAlignment()
  const openInNewTab = node.getOpenInNewTab()

  // 更新ヘルパー
  const updateNode = useCallback(
    (updater: (node: ButtonNode) => void) => {
      editor.update(() => {
        const targetNode = $getNodeByKey(nodeKey)
        if ($isButtonNode(targetNode)) {
          updater(targetNode)
        }
      })
    },
    [editor, nodeKey]
  )

  const handleTextChange = useCallback(
    (value: string) => updateNode((n) => n.setText(value)),
    [updateNode]
  )

  const handleHrefChange = useCallback(
    (value: string) => updateNode((n) => n.setHref(value)),
    [updateNode]
  )

  const handleVariantChange = useCallback(
    (value: string) => {
      if (isButtonVariant(value)) {
        updateNode((n) => n.setVariant(value))
      }
    },
    [updateNode]
  )

  const handleSizeChange = useCallback(
    (value: string) => {
      if (isButtonSize(value)) {
        updateNode((n) => n.setSize(value))
      }
    },
    [updateNode]
  )

  const handleAlignmentChange = useCallback(
    (value: string) => {
      if (isButtonAlignment(value)) {
        updateNode((n) => n.setAlignment(value))
      }
    },
    [updateNode]
  )

  const handleOpenInNewTabChange = useCallback(
    (value: boolean) => updateNode((n) => n.setOpenInNewTab(value)),
    [updateNode]
  )

  return (
    <div>
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm">ボタン</h3>
      </div>

      <InspectorSection title="基本設定">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="inspector-button-text" className="text-xs">
              テキスト
            </Label>
            <Input
              id="inspector-button-text"
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inspector-button-href" className="text-xs">
              リンク先URL
            </Label>
            <Input
              id="inspector-button-href"
              value={href}
              onChange={(e) => handleHrefChange(e.target.value)}
              placeholder="https://example.com"
              className="h-8 text-sm"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="inspector-button-new-tab" className="text-xs cursor-pointer">
              新しいタブで開く
            </Label>
            <Switch
              id="inspector-button-new-tab"
              checked={openInNewTab}
              onCheckedChange={handleOpenInNewTabChange}
            />
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="スタイル">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">スタイル</Label>
            <SelectionBox
              options={VARIANT_OPTIONS}
              value={variant}
              onChange={handleVariantChange}
              columns={3}
              name="ボタンスタイル"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">サイズ</Label>
            <SelectionBox
              options={SIZE_OPTIONS}
              value={size}
              onChange={handleSizeChange}
              columns={3}
              name="ボタンサイズ"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">配置</Label>
            <SelectionBox
              options={ALIGNMENT_OPTIONS}
              value={alignment}
              onChange={handleAlignmentChange}
              columns={3}
              name="ボタン配置"
            />
          </div>
        </div>
      </InspectorSection>
    </div>
  )
}
