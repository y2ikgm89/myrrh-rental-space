/**
 * Tooltip Plugin
 *
 * @description ツールチップ挿入ダイアログを提供するプラグイン
 */

'use client'

import { useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $insertNodes, $isRangeSelection } from 'lexical'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
  Textarea,
} from '@/admin/components/ui'
import { $createTooltipNode } from '../nodes/TooltipNode'

// =============================================================================
// Types
// =============================================================================

type TooltipPluginProps = {
  isOpen: boolean
  onClose: () => void
}

// =============================================================================
// Component
// =============================================================================

export function TooltipPlugin({ isOpen, onClose }: TooltipPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [baseText, setBaseText] = useState('')
  const [tooltipText, setTooltipText] = useState('')

  const handleSubmit = () => {
    if (!baseText || !tooltipText) return

    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        selection.removeText()
      }
      $insertNodes([$createTooltipNode(baseText, tooltipText)])
    })

    setBaseText('')
    setTooltipText('')
    onClose()
  }

  const handleClose = () => {
    setBaseText('')
    setTooltipText('')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ツールチップを挿入</DialogTitle>
          <DialogDescription>表示テキストとツールチップの説明文を入力してください</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tooltip-base">表示テキスト</Label>
            <Input
              id="tooltip-base"
              value={baseText}
              onChange={(e) => setBaseText(e.target.value)}
              placeholder="表示する文字"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tooltip-text">ツールチップ説明</Label>
            <Textarea
              id="tooltip-text"
              value={tooltipText}
              onChange={(e) => setTooltipText(e.target.value)}
              placeholder="ホバー時に表示する説明文"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              キャンセル
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!baseText || !tooltipText}>
              挿入
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
