/**
 * X (Twitter) Plugin
 *
 * @description X（Twitter）投稿挿入ダイアログを提供するプラグイン
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
import { $createXNode } from '../nodes/XNode'

// =============================================================================
// Types
// =============================================================================

type XPluginProps = {
  isOpen: boolean
  onClose: () => void
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * X（Twitter）URLからツイートIDを抽出する
 *
 * 対応形式:
 * - https://twitter.com/user/status/1234567890123456789
 * - https://x.com/user/status/1234567890123456789
 * - https://mobile.twitter.com/user/status/1234567890123456789
 * - https://mobile.x.com/user/status/1234567890123456789
 * - https://platform.twitter.com/embed/Tweet.html?id=1234567890123456789
 */
function extractTweetId(url: string): string | null {
  // twitter.com/x.com 標準形式（モバイル含む）
  const standardMatch = url.match(/(?:mobile\.)?(?:twitter|x)\.com\/\w+\/status\/(\d+)/)
  if (standardMatch?.[1]) {
    return standardMatch[1]
  }

  // 埋め込みURL（既存埋め込みコードから）
  const embedMatch = url.match(/platform\.twitter\.com\/embed\/Tweet\.html\?id=(\d+)/)
  if (embedMatch?.[1]) {
    return embedMatch[1]
  }

  // 直接ツイートIDが入力された場合（15-19桁の数字のみ）
  if (/^\d{15,19}$/.test(url.trim())) {
    return url.trim()
  }

  return null
}

// =============================================================================
// Component
// =============================================================================

export function XPlugin({ isOpen, onClose }: XPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = () => {
    const tweetId = extractTweetId(url)

    if (!tweetId) {
      setError('有効なX（Twitter）URLを入力してください')
      return
    }

    editor.update(() => {
      const node = $createXNode({ tweetId })
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
          <DialogTitle>X（Twitter）投稿を挿入</DialogTitle>
          <DialogDescription>
            X（Twitter）投稿のURLを入力してください
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="x-url">URL</Label>
            <Input
              id="x-url"
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setError('')
              }}
              placeholder="https://x.com/user/status/..."
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
 * Xダイアログの状態管理フック
 */
export function useXDialog() {
  const [isOpen, setIsOpen] = useState(false)

  const openXDialog = useCallback(() => setIsOpen(true), [])
  const closeXDialog = useCallback(() => setIsOpen(false), [])

  return {
    isXDialogOpen: isOpen,
    openXDialog,
    closeXDialog,
  }
}
