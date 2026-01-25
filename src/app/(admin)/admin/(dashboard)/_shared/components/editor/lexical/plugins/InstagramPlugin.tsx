/**
 * Instagram Plugin
 *
 * @description Instagram投稿挿入ダイアログを提供するプラグイン
 */

'use client'

import { useCallback, useState } from 'react'
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
import { $createInstagramNode } from '../nodes/InstagramNode'

// =============================================================================
// Types
// =============================================================================

type InstagramPluginProps = {
  isOpen: boolean
  onClose: () => void
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Instagram URLから投稿IDを抽出する
 *
 * 対応形式:
 * - https://www.instagram.com/p/{postId}/
 * - https://www.instagram.com/reel/{postId}/
 * - https://instagram.com/p/{postId}/
 * - https://www.instagram.com/p/{postId}/?...
 * - 直接postId入力（英数字、アンダースコア、ハイフン）
 */
function extractInstagramPostId(url: string): string | null {
  const trimmedUrl = url.trim()

  // instagram.com/p/ または instagram.com/reel/ 形式
  const postMatch = trimmedUrl.match(
    /(?:www\.)?instagram\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)/
  )
  if (postMatch?.[1]) {
    return postMatch[1]
  }

  // 直接postIdが入力された場合（英数字、アンダースコア、ハイフンのみ、1-50文字）
  if (/^[a-zA-Z0-9_-]{1,50}$/.test(trimmedUrl)) {
    return trimmedUrl
  }

  return null
}

// =============================================================================
// Component
// =============================================================================

export function InstagramPlugin({ isOpen, onClose }: InstagramPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  const postId = extractInstagramPostId(url)

  const handleSubmit = useCallback(() => {
    if (!postId) {
      setError('有効なInstagram URLまたは投稿IDを入力してください')
      return
    }

    editor.update(() => {
      const node = $createInstagramNode({ postId })
      $insertNodes([node])
    })

    setUrl('')
    setError('')
    onClose()
  }, [editor, postId, onClose])

  const handleClose = useCallback(() => {
    setUrl('')
    setError('')
    onClose()
  }, [onClose])

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value)
    setError('')
  }, [])

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Instagram投稿を埋め込み</DialogTitle>
          <DialogDescription>
            Instagram投稿のURLまたは投稿IDを入力してください
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="instagram-url">URL</Label>
            <Input
              id="instagram-url"
              type="url"
              value={url}
              onChange={handleUrlChange}
              placeholder="https://www.instagram.com/p/xxxxx/"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {/* プレビュー */}
          {postId && (
            <div className="aspect-square max-w-[300px] mx-auto">
              <iframe
                src={`https://www.instagram.com/p/${postId}/embed`}
                title="Instagram preview"
                className="w-full h-full border-0 rounded-lg"
                scrolling="no"
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              キャンセル
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!postId}>
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
 * Instagramダイアログの状態管理フック
 */
export function useInstagramDialog() {
  const [isOpen, setIsOpen] = useState(false)

  const openInstagramDialog = useCallback(() => setIsOpen(true), [])
  const closeInstagramDialog = useCallback(() => setIsOpen(false), [])

  return {
    isInstagramDialogOpen: isOpen,
    openInstagramDialog,
    closeInstagramDialog,
  }
}
