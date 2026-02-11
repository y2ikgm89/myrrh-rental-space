/**
 * YouTube Plugin
 *
 * @description YouTube動画挿入ダイアログを提供するプラグイン
 */

'use client'

import { useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $insertNodes } from 'lexical'
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
import { $createYouTubeNode } from '../nodes/YouTubeNode'

// =============================================================================
// Types
// =============================================================================

type YouTubePluginProps = {
  isOpen: boolean
  onClose: () => void
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * YouTube URLからビデオIDを抽出する
 */
function extractVideoId(url: string): string | null {
  // 短縮URL: youtu.be/VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
  if (shortMatch?.[1]) {
    return shortMatch[1]
  }

  // 通常URL: youtube.com/watch?v=VIDEO_ID
  const normalMatch = url.match(/[?&]v=([a-zA-Z0-9_-]+)/)
  if (normalMatch?.[1]) {
    return normalMatch[1]
  }

  // 埋め込みURL: youtube.com/embed/VIDEO_ID
  const embedMatch = url.match(/embed\/([a-zA-Z0-9_-]+)/)
  if (embedMatch?.[1]) {
    return embedMatch[1]
  }

  return null
}

// =============================================================================
// Component
// =============================================================================

export function YouTubePlugin({ isOpen, onClose }: YouTubePluginProps) {
  const [editor] = useLexicalComposerContext()
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = () => {
    const videoId = extractVideoId(url)

    if (!videoId) {
      setError('有効なYouTube URLを入力してください')
      return
    }

    editor.update(() => {
      const node = $createYouTubeNode({ videoId })
      $insertNodes([node])
    })

    setUrl('')
    setError('')
    onClose()
  }

  const handleClose = () => {
    setUrl('')
    setError('')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>YouTube動画を挿入</DialogTitle>
          <DialogDescription>
            YouTube動画のURLを入力してください
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="youtube-url">YouTube URL</Label>
            <Input
              id="youtube-url"
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setError('')
              }}
              placeholder="https://www.youtube.com/watch?v=..."
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
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

// =============================================================================
// Hook
// =============================================================================

/**
 * YouTubeダイアログの状態管理フック
 */
export function useYouTubeDialog() {
  const [isOpen, setIsOpen] = useState(false)

  const openYouTubeDialog = () => setIsOpen(true)
  const closeYouTubeDialog = () => setIsOpen(false)

  return {
    isYouTubeDialogOpen: isOpen,
    openYouTubeDialog,
    closeYouTubeDialog,
  }
}
