/**
 * Bookmark Plugin
 *
 * @description ブックマーク/リンクカードの挿入を提供するプラグイン
 *
 * URLを入力するとOGP情報を取得し、リッチなカード形式で挿入
 */

'use client'

import { useCallback, useState, useTransition } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection, $insertNodes } from 'lexical'
import { Loader2, ExternalLink, AlertCircle } from 'lucide-react'
import { $createBookmarkNode } from '../nodes/BookmarkNode'
import { fetchOgp } from '../../../../actions/fetch-ogp'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Label,
} from '@/admin/components/ui'

// =============================================================================
// Hook
// =============================================================================

export function useBookmarkDialog() {
  const [isBookmarkDialogOpen, setIsBookmarkDialogOpen] = useState(false)

  const openBookmarkDialog = useCallback(() => setIsBookmarkDialogOpen(true), [])
  const closeBookmarkDialog = useCallback(() => setIsBookmarkDialogOpen(false), [])

  return {
    isBookmarkDialogOpen,
    openBookmarkDialog,
    closeBookmarkDialog,
  }
}

// =============================================================================
// Types
// =============================================================================

type BookmarkPluginProps = {
  isOpen: boolean
  onClose: () => void
}

type OgpPreview = {
  url: string
  title: string
  description: string
  imageUrl: string
  faviconUrl: string
  siteName: string
} | null

// =============================================================================
// Component
// =============================================================================

export function BookmarkPlugin({ isOpen, onClose }: BookmarkPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<OgpPreview>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const resetForm = () => {
    setUrl('')
    setPreview(null)
    setError(null)
  }

  const handleFetchOgp = () => {
    if (!url.trim()) return

    setError(null)
    setPreview(null)

    startTransition(async () => {
      const result = await fetchOgp(url.trim())
      if (result.success) {
        setPreview(result.data)
        setError(null)
      } else {
        setError(result.error)
        setPreview(null)
      }
    })
  }

  const handleInsert = () => {
    if (!preview) return

    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return

      const bookmarkNode = $createBookmarkNode({
        url: preview.url,
        title: preview.title,
        description: preview.description,
        imageUrl: preview.imageUrl,
        faviconUrl: preview.faviconUrl,
        siteName: preview.siteName,
      })

      $insertNodes([bookmarkNode])
    })

    resetForm()
    onClose()
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>ブックマークを挿入</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* URL入力 */}
          <div className="space-y-2">
            <Label htmlFor="bookmark-url">URL</Label>
            <div className="flex gap-2">
              <Input
                id="bookmark-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                type="url"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleFetchOgp()
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleFetchOgp}
                disabled={!url.trim() || isPending}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  '取得'
                )}
              </Button>
            </div>
          </div>

          {/* エラー表示 */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          {/* プレビュー */}
          {preview && (
            <div className="border rounded-lg overflow-hidden">
              <div className="flex">
                {/* テキスト部分 */}
                <div className="flex-1 p-4 min-w-0">
                  {/* サイト情報 */}
                  <div className="flex items-center gap-2 mb-2">
                    {preview.faviconUrl ? (
                      <img
                        src={preview.faviconUrl}
                        alt=""
                        className="w-4 h-4 rounded-sm"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    ) : (
                      <ExternalLink className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="text-xs text-muted-foreground truncate">
                      {preview.siteName || new URL(preview.url).hostname}
                    </span>
                  </div>
                  {/* タイトル */}
                  <h4 className="font-medium text-sm line-clamp-2 mb-1">
                    {preview.title || preview.url}
                  </h4>
                  {/* 説明 */}
                  {preview.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {preview.description}
                    </p>
                  )}
                </div>
                {/* 画像部分 */}
                {preview.imageUrl && (
                  <div className="w-32 h-24 flex-shrink-0">
                    <img
                      src={preview.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.parentElement?.remove()
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            キャンセル
          </Button>
          <Button type="button" onClick={handleInsert} disabled={!preview}>
            挿入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
