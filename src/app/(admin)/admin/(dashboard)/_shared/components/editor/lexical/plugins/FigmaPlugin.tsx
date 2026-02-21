/**
 * Figma Plugin
 *
 * @description Figma デザイン埋め込みダイアログを提供するプラグイン
 */

'use client'

import { useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $insertNodeToNearestRoot } from '@lexical/utils'
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
import { $createFigmaNode, toFigmaEmbedUrl } from '../nodes/FigmaNode'
import type { DialogPluginProps } from '../config/dialog-registry'

// =============================================================================
// Component
// =============================================================================

export function FigmaPlugin({ isOpen, onClose }: DialogPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')

  const handleInsert = () => {
    const trimmedUrl = url.trim()
    if (!trimmedUrl) return

    const embedUrl = toFigmaEmbedUrl(trimmedUrl)
    if (!embedUrl) {
      setError('Figma の URL ではありません')
      return
    }

    editor.update(() => {
      const figmaNode = $createFigmaNode({
        embedUrl,
        label: label.trim(),
      })
      $insertNodeToNearestRoot(figmaNode)
    })

    handleClose()
  }

  const handleClose = () => {
    setUrl('')
    setLabel('')
    setError('')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Figma デザインを挿入</DialogTitle>
          <DialogDescription>Figma の共有 URL を入力してください</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="figma-url">Figma URL（必須）</Label>
            <Input
              id="figma-url"
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setError('')
              }}
              placeholder="https://www.figma.com/file/..."
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="figma-label">ラベル（任意）</Label>
            <Input
              id="figma-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="デザイン名・説明"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              キャンセル
            </Button>
            <Button type="button" onClick={handleInsert} disabled={!url.trim()}>
              挿入
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
