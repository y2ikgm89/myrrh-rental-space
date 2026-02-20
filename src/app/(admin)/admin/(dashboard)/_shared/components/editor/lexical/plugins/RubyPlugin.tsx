/**
 * Ruby Plugin
 *
 * @description ルビ（ふりがな）挿入ダイアログを提供するプラグイン
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
} from '@/admin/components/ui'
import { $createRubyNode } from '../nodes/RubyNode'

// =============================================================================
// Types
// =============================================================================

type RubyPluginProps = {
  isOpen: boolean
  onClose: () => void
}

// =============================================================================
// Component
// =============================================================================

export function RubyPlugin({ isOpen, onClose }: RubyPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [baseText, setBaseText] = useState('')
  const [rubyText, setRubyText] = useState('')

  const handleSubmit = () => {
    if (!baseText || !rubyText) return

    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        selection.removeText()
      }
      $insertNodes([$createRubyNode(baseText, rubyText)])
    })

    setBaseText('')
    setRubyText('')
    onClose()
  }

  const handleClose = () => {
    setBaseText('')
    setRubyText('')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ルビを挿入</DialogTitle>
          <DialogDescription>ベーステキストとルビ（ふりがな）を入力してください</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ruby-base">ベーステキスト</Label>
            <Input
              id="ruby-base"
              value={baseText}
              onChange={(e) => setBaseText(e.target.value)}
              placeholder="漢字"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ruby-text">ルビ（ふりがな）</Label>
            <Input
              id="ruby-text"
              value={rubyText}
              onChange={(e) => setRubyText(e.target.value)}
              placeholder="かんじ"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              キャンセル
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!baseText || !rubyText}>
              挿入
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
