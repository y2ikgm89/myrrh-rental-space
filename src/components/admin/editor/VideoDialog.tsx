'use client'

/**
 * VideoDialog コンポーネント
 *
 * 動画挿入用ダイアログ
 * - YouTube埋め込み
 * - Supabase Storageへの動画アップロード
 */

import Image from 'next/image'
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
import { uploadFile } from '@/lib/storage'
import { STORAGE_BUCKETS } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface VideoDialogProps {
  editor: Editor
  open: boolean
  onOpenChange: (open: boolean) => void
}

// YouTubeのURL形式からVideo IDを抽出
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }

  return null
}

export function VideoDialog({ editor, open, onOpenChange }: VideoDialogProps) {
  const [activeTab, setActiveTab] = useState<'youtube' | 'upload'>('youtube')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // リセット
  const reset = () => {
    setYoutubeUrl('')
    setFile(null)
    setPreview(null)
    setError(null)
    setFailedThumbnailUrl(null)
    setIsUploading(false)
    setUploadProgress(0)
    setActiveTab('youtube')
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
    const allowedTypes = ['video/mp4', 'video/webm']
    if (!allowedTypes.includes(selectedFile.type)) {
      setError('対応形式: MP4, WebM')
      return
    }

    const maxSize = 50 * 1024 * 1024 // 50MB
    if (selectedFile.size > maxSize) {
      setError('ファイルサイズは50MB以下にしてください')
      return
    }

    setFile(selectedFile)
    setError(null)

    // プレビュー用URL生成
    const objectUrl = URL.createObjectURL(selectedFile)
    setPreview(objectUrl)
  }

  // ドラッグ&ドロップ
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && droppedFile.type.startsWith('video/')) {
      const event = {
        target: { files: [droppedFile] },
      } as unknown as React.ChangeEvent<HTMLInputElement>
      handleFileSelect(event)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  // 動画挿入
  const handleInsert = async () => {
    setError(null)

    if (activeTab === 'youtube') {
      // YouTube埋め込み
      if (!youtubeUrl.trim()) {
        setError('YouTube URLを入力してください')
        return
      }

      const videoId = extractYouTubeVideoId(youtubeUrl)
      if (!videoId) {
        setError('有効なYouTube URLを入力してください')
        return
      }

      editor.chain().focus().setYoutubeVideo({ src: youtubeUrl }).run()
      handleClose()
    } else {
      // 動画アップロード
      if (!file) {
        setError('ファイルを選択してください')
        return
      }

      setIsUploading(true)
      setUploadProgress(10)

      try {
        // シミュレート進捗表示（実際のAPIは進捗をサポートしない場合がある）
        const progressInterval = setInterval(() => {
          setUploadProgress((prev) => Math.min(prev + 10, 90))
        }, 500)

        const result = await uploadFile(file, STORAGE_BUCKETS.BLOG, {
          folder: 'videos',
          validation: {
            maxSize: 50 * 1024 * 1024, // 50MB
            allowedTypes: ['video/mp4', 'video/webm'],
          },
        })

        clearInterval(progressInterval)
        setUploadProgress(100)

        if (!result.success || !result.url) {
          setError(result.error || 'アップロードに失敗しました')
          setIsUploading(false)
          return
        }

        // HTML5 videoタグとして挿入（TiptapにはビデオNodeがないためHTMLを挿入）
        // XSS対策: file.typeをホワイトリストで検証
        const safeType = ['video/mp4', 'video/webm'].includes(file.type) ? file.type : 'video/mp4'

        editor.chain().focus().insertContent(`
          <video controls style="max-width: 100%; height: auto;">
            <source src="${result.url}" type="${safeType}">
            お使いのブラウザは動画タグをサポートしていません。
          </video>
        `).run()

        handleClose()
      } catch {
        setError('アップロード中にエラーが発生しました')
        setIsUploading(false)
      }
    }
  }

  // YouTubeサムネイル取得
  const youtubeThumbnail = youtubeUrl
    ? (() => {
        const videoId = extractYouTubeVideoId(youtubeUrl)
        return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null
      })()
    : null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>動画を挿入</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'youtube' | 'upload')}>
          <TabsList className="w-full">
            <TabsTrigger value="youtube" className="flex-1">
              YouTube
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex-1">
              アップロード
            </TabsTrigger>
          </TabsList>

          <TabsContent value="youtube" className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">YouTube URL</label>
              <input
                type="url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                youtube.com、youtu.be、YouTube Shorts に対応
              </p>
            </div>

            {/* YouTubeサムネイルプレビュー */}
            {youtubeThumbnail && youtubeThumbnail !== failedThumbnailUrl && (
              <div className="relative border rounded-md overflow-hidden aspect-video">
                <Image
                  src={youtubeThumbnail}
                  alt="YouTube サムネイル"
                  fill
                  className="object-cover"
                  sizes="480px"
                  onError={() => setFailedThumbnailUrl(youtubeThumbnail)}
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
                accept="video/mp4,video/webm"
                onChange={handleFileSelect}
                className="hidden"
              />

              {preview ? (
                <div className="space-y-2">
                  <video
                    src={preview}
                    className="max-h-40 mx-auto rounded"
                    controls={false}
                    muted
                  />
                  <p className="text-sm text-muted-foreground">{file?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {file && `${(file.size / (1024 * 1024)).toFixed(2)} MB`}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <svg
                    className="h-10 w-10 mx-auto text-muted-foreground"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12.244 4c.534.003 1.87.016 3.29.073l.504.022c1.429.067 2.857.183 3.566.38.945.266 1.687 1.04 1.938 2.022.4 1.56.45 4.602.454 5.208v.59c-.004.606-.054 3.648-.454 5.208-.251.982-.993 1.756-1.938 2.022-.709.197-2.137.313-3.566.38l-.504.023c-1.42.056-2.756.07-3.29.072l-.488.001-.243-.001c-.534-.003-1.87-.016-3.29-.073l-.504-.022c-1.429-.067-2.857-.183-3.566-.38-.945-.266-1.687-1.04-1.938-2.022C2 16.242 2 12.2 2 12V11.8c0-.2 0-4.242.455-5.502.251-.982.993-1.756 1.938-2.022.709-.197 2.137-.313 3.566-.38l.504-.023C9.883 3.817 11.22 3.804 11.754 3.802L12 3.8l.244.2ZM10 15.464V8.536L16 12l-6 3.464Z" />
                  </svg>
                  <p className="text-sm text-muted-foreground">
                    クリックまたはドラッグ&ドロップ
                  </p>
                  <p className="text-xs text-muted-foreground">
                    MP4, WebM（最大50MB）
                  </p>
                </div>
              )}
            </div>

            {/* アップロード進捗 */}
            {isUploading && (
              <div className="space-y-1">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  {uploadProgress}% アップロード中...
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>

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
            disabled={
              isUploading ||
              (activeTab === 'youtube' && !youtubeUrl) ||
              (activeTab === 'upload' && !file)
            }
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
