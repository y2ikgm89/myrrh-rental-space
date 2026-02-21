/**
 * Spotify Plugin
 *
 * @description Spotify 埋め込みダイアログを提供するプラグイン
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
import { $createSpotifyNode, toSpotifyEmbedUrl } from '../nodes/SpotifyNode'
import type { DialogPluginProps } from '../config/dialog-registry'

// =============================================================================
// Component
// =============================================================================

export function SpotifyPlugin({ isOpen, onClose }: DialogPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleInsert = () => {
    const trimmed = url.trim()
    if (!trimmed) return

    const result = toSpotifyEmbedUrl(trimmed)
    if (!result) {
      setError('Spotify の URL ではありません')
      return
    }

    editor.update(() => {
      const spotifyNode = $createSpotifyNode(result)
      $insertNodeToNearestRoot(spotifyNode)
    })

    handleClose()
  }

  const handleClose = () => {
    setUrl('')
    setError(null)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Spotify を挿入</DialogTitle>
          <DialogDescription>
            Spotify のトラック・アルバム・プレイリスト・Podcast の URL を入力してください
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="spotify-url">Spotify URL（必須）</Label>
            <Input
              id="spotify-url"
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setError(null)
              }}
              placeholder="https://open.spotify.com/track/..."
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
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
