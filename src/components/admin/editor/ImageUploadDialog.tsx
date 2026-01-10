'use client'

/**
 * ImageUploadDialog コンポーネント
 *
 * 画像挿入用ダイアログ
 * - URL入力またはSupabase Storageへのアップロード
 * - プレビュー表示
 * - alt属性の設定
 */

import { useState, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/admin/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/admin/ui/tabs'
import { uploadBlogImage } from '@/lib/storage'
import { cn } from '@/lib/utils'

interface ImageUploadDialogProps {
  editor: Editor
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImageUploadDialog({ editor, open, onOpenChange }: ImageUploadDialogProps) {
  const [activeTab, setActiveTab] = useState<'url' | 'upload'>('url')
  const [url, setUrl] = useState('')
  const [alt, setAlt] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // リセット
  const reset = () => {
    setUrl('')
    setAlt('')
    setFile(null)
    setPreview(null)
    setError(null)
    setIsUploading(false)
    setActiveTab('url')
  }

  // ダイアログを閉じる
  const handleClose = () => {
    reset()
    onOpenChange(false)
  }

  // ファイル選択
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    // バリデーション
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
    if (!allowedTypes.includes(selectedFile.type)) {
      setError('対応形式: JPEG, PNG, WebP, GIF, AVIF')
      return
    }

    const maxSize = 5 * 1024 * 1024 // 5MB
    if (selectedFile.size > maxSize) {
      setError('ファイルサイズは5MB以下にしてください')
      return
    }

    setFile(selectedFile)
    setError(null)

    // プレビュー生成
    const reader = new FileReader()
    reader.onload = (event) => {
      setPreview(event.target?.result as string)
    }
    reader.readAsDataURL(selectedFile)
  }

  // ドラッグ&ドロップ
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && droppedFile.type.startsWith('image/')) {
      const event = {
        target: { files: [droppedFile] },
      } as unknown as React.ChangeEvent<HTMLInputElement>
      handleFileSelect(event)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  // 画像挿入
  const handleInsert = async () => {
    setError(null)

    if (activeTab === 'url') {
      // URL入力
      if (!url.trim()) {
        setError('URLを入力してください')
        return
      }

      // URL形式の簡易チェック
      try {
        new URL(url)
      } catch {
        setError('有効なURLを入力してください')
        return
      }

      editor.chain().focus().setImage({ src: url, alt: alt || undefined }).run()
      handleClose()
    } else {
      // ファイルアップロード
      if (!file) {
        setError('ファイルを選択してください')
        return
      }

      setIsUploading(true)

      try {
        const result = await uploadBlogImage(file)

        if (!result.success || !result.url) {
          setError(result.error || 'アップロードに失敗しました')
          setIsUploading(false)
          return
        }

        editor.chain().focus().setImage({ src: result.url, alt: alt || undefined }).run()
        handleClose()
      } catch {
        setError('アップロード中にエラーが発生しました')
        setIsUploading(false)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>画像を挿入</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'url' | 'upload')}>
          <TabsList className="w-full">
            <TabsTrigger value="url" className="flex-1">
              URLで挿入
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex-1">
              アップロード
            </TabsTrigger>
          </TabsList>

          <TabsContent value="url" className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">画像URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* URLプレビュー - ユーザー入力の任意URLのため<img>を使用 */}
            {url && (
              <div className="border rounded-md p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="プレビュー"
                  className="max-h-40 mx-auto object-contain"
                  onError={() => setError('画像を読み込めませんでした')}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="upload" className="space-y-4">
            {/* ドロップゾーン */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
                'hover:border-primary hover:bg-muted/50',
                file && 'border-primary bg-muted/50'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* FileReaderのdata URLはNext.js Image非対応のため<img>を使用 */}
              {preview ? (
                <div className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt="プレビュー"
                    className="max-h-40 mx-auto object-contain rounded"
                  />
                  <p className="text-sm text-muted-foreground">{file?.name}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <svg
                    className="h-10 w-10 mx-auto text-muted-foreground"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M4.828 21l-.02.02-.021-.02H2.992A.993.993 0 0 1 2 20.007V3.993A1 1 0 0 1 2.992 3h18.016c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H4.828ZM20 15V5H4v14L14 9l6 6Zm0 2.828-6-6L6.828 19H20v-1.172ZM8 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
                  </svg>
                  <p className="text-sm text-muted-foreground">
                    クリックまたはドラッグ&ドロップ
                  </p>
                  <p className="text-xs text-muted-foreground">
                    JPEG, PNG, WebP, GIF, AVIF（最大5MB）
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Alt属性 */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            代替テキスト（alt）
            <span className="text-muted-foreground font-normal ml-1">- 任意</span>
          </label>
          <input
            type="text"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            placeholder="画像の説明"
            className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* エラー表示 */}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={handleClose}
            className="h-9 px-4 rounded-md border text-sm font-medium hover:bg-muted transition-colors"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleInsert}
            disabled={isUploading || (activeTab === 'url' && !url) || (activeTab === 'upload' && !file)}
            className={cn(
              'h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium',
              'hover:bg-primary/90 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isUploading ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path
                    fill="currentColor"
                    className="opacity-75"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                アップロード中...
              </span>
            ) : (
              '挿入'
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
