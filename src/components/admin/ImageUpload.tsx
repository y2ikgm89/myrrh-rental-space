'use client'

import Image from 'next/image'
import { useState, useRef } from 'react'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'

type Props = {
  onUpload: (formData: FormData) => Promise<{ success: boolean; url?: string; error?: string }>
  onDelete?: (url: string) => Promise<{ success: boolean; error?: string }>
  currentUrl?: string | null
  accept?: string
  maxSize?: number // in MB
  label?: string
  className?: string
}

export function ImageUpload({
  onUpload,
  onDelete,
  currentUrl,
  accept = 'image/jpeg,image/png,image/webp,image/gif',
  maxSize = 5,
  label = '画像をアップロード',
  className,
}: Props) {
  const [isUploading, setIsUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl || null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // ファイルサイズチェック
    if (file.size > maxSize * 1024 * 1024) {
      setError(`ファイルサイズは${maxSize}MB以下にしてください`)
      return
    }

    setError(null)
    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const result = await onUpload(formData)

      if (result.success && result.url) {
        setPreviewUrl(result.url)
      } else {
        setError(result.error || 'アップロードに失敗しました')
      }
    } catch {
      setError('アップロードに失敗しました')
    } finally {
      setIsUploading(false)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }

  const handleDelete = async () => {
    if (!previewUrl || !onDelete) return

    setIsDeleting(true)
    setError(null)

    try {
      const result = await onDelete(previewUrl)

      if (result.success) {
        setPreviewUrl(null)
      } else {
        setError(result.error || '削除に失敗しました')
      }
    } catch {
      setError('削除に失敗しました')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className={className}>
      {previewUrl ? (
        <div className="space-y-2">
          <div className="relative inline-block max-w-xs h-48">
            <Image
              src={previewUrl}
              alt="Preview"
              fill
              className="rounded-lg border object-cover"
              sizes="320px"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? 'アップロード中...' : '変更'}
            </Button>
            {onDelete && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? '削除中...' : '削除'}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? 'アップロード中...' : label}
          </Button>
          <p className="text-xs text-muted-foreground">
            最大{maxSize}MB、対応形式: JPEG, PNG, WebP, GIF
          </p>
        </div>
      )}

      <Input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
      />

      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}

type MultiImageUploadProps = {
  onUpload: (formData: FormData) => Promise<{ success: boolean; urls?: string[]; error?: string }>
  onDelete?: (url: string) => Promise<{ success: boolean; error?: string }>
  currentUrls?: string[]
  accept?: string
  maxSize?: number
  maxFiles?: number
  label?: string
  className?: string
}

export function MultiImageUpload({
  onUpload,
  onDelete,
  currentUrls = [],
  accept = 'image/jpeg,image/png,image/webp,image/gif',
  maxSize = 10,
  maxFiles = 10,
  label = '画像を追加',
  className,
}: MultiImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [urls, setUrls] = useState<string[]>(currentUrls)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFilesSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // ファイル数チェック
    if (urls.length + files.length > maxFiles) {
      setError(`最大${maxFiles}枚までアップロードできます`)
      return
    }

    // ファイルサイズチェック
    for (const file of files) {
      if (file.size > maxSize * 1024 * 1024) {
        setError(`各ファイルは${maxSize}MB以下にしてください`)
        return
      }
    }

    setError(null)
    setIsUploading(true)

    try {
      const formData = new FormData()
      files.forEach((file) => formData.append('files', file))

      const result = await onUpload(formData)

      if (result.success && result.urls) {
        setUrls((prev) => [...prev, ...result.urls!])
      } else {
        setError(result.error || 'アップロードに失敗しました')
      }
    } catch {
      setError('アップロードに失敗しました')
    } finally {
      setIsUploading(false)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }

  const handleDelete = async (url: string) => {
    if (!onDelete) return

    setDeletingUrl(url)
    setError(null)

    try {
      const result = await onDelete(url)

      if (result.success) {
        setUrls((prev) => prev.filter((u) => u !== url))
      } else {
        setError(result.error || '削除に失敗しました')
      }
    } catch {
      setError('削除に失敗しました')
    } finally {
      setDeletingUrl(null)
    }
  }

  return (
    <div className={className}>
      {urls.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {urls.map((url, index) => (
            <div key={url} className="relative group h-32">
              <Image
                src={url}
                alt={`Image ${index + 1}`}
                fill
                className="object-cover rounded-lg border"
                sizes="(max-width: 768px) 50vw, 25vw"
              />
              {onDelete && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleDelete(url)}
                  disabled={deletingUrl === url}
                >
                  {deletingUrl === url ? '...' : '×'}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {urls.length < maxFiles && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? 'アップロード中...' : label}
          </Button>
          <p className="text-xs text-muted-foreground">
            最大{maxFiles}枚、各{maxSize}MB以下
          </p>
        </div>
      )}

      <Input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        onChange={handleFilesSelect}
        className="hidden"
      />

      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}
