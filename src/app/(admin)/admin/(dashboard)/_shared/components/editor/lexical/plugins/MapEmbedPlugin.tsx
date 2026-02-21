/**
 * MapEmbed Plugin
 *
 * @description Google マップ埋め込みダイアログを提供するプラグイン
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
import { $createMapEmbedNode, toEmbedUrl } from '../nodes/MapEmbedNode'

// =============================================================================
// Types
// =============================================================================

type MapEmbedPluginProps = {
  isOpen: boolean
  onClose: () => void
}

// =============================================================================
// Component
// =============================================================================

export function MapEmbedPlugin({ isOpen, onClose }: MapEmbedPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = () => {
    const embedUrl = toEmbedUrl(url)

    if (!embedUrl) {
      setError('Google マップの「共有 > マップを埋め込む」から取得した URL を入力してください')
      return
    }

    editor.update(() => {
      const node = $createMapEmbedNode(embedUrl, label)
      $insertNodeToNearestRoot(node)
    })

    setUrl('')
    setLabel('')
    setError('')
    onClose()
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
          <DialogTitle>Google マップを挿入</DialogTitle>
          <DialogDescription>
            Google マップの URL を入力してください
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="map-embed-url">Google マップ URL</Label>
            <Input
              id="map-embed-url"
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setError('')
              }}
              placeholder="https://www.google.com/maps/embed?pb=...（共有 > マップを埋め込む から取得）"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="map-embed-label">ラベル（任意）</Label>
            <Input
              id="map-embed-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="アクセスマップ"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              キャンセル
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!url}>
              挿入
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
