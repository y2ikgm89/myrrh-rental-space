/**
 * File Plugin
 *
 * @description ファイル添付ダイアログを提供するプラグイン
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
import { $createFileNode } from '../nodes/FileNode'
import type { DialogPluginProps } from '../config/dialog-registry'

// =============================================================================
// Helpers
// =============================================================================

function extractFilenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    return decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '')
  } catch {
    return ''
  }
}

// =============================================================================
// Component
// =============================================================================

export function FilePlugin({ isOpen, onClose }: DialogPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [url, setUrl] = useState('')
  const [fileName, setFileName] = useState('')

  const handleUrlBlur = () => {
    if (!fileName.trim() && url.trim()) {
      const extracted = extractFilenameFromUrl(url.trim())
      if (extracted) {
        setFileName(extracted)
      }
    }
  }

  const handleInsert = () => {
    if (!url.trim()) return

    editor.update(() => {
      const fileNode = $createFileNode({
        url: url.trim(),
        fileName: fileName.trim() || extractFilenameFromUrl(url.trim()) || url.trim(),
        fileSize: 0,
        mime: '',
      })
      $insertNodeToNearestRoot(fileNode)
    })

    handleClose()
  }

  const handleClose = () => {
    setUrl('')
    setFileName('')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ファイルを添付</DialogTitle>
          <DialogDescription>ファイルのURLを入力してください</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file-url">ファイルURL（必須）</Label>
            <Input
              id="file-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={handleUrlBlur}
              placeholder="https://example.com/document.pdf"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="file-name">ファイル名（任意）</Label>
            <Input
              id="file-name"
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="document.pdf"
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
