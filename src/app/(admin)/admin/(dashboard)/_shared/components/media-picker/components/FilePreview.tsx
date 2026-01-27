'use client'

/**
 * FilePreview
 *
 * アップロードファイルのプレビュー
 */

import { X } from 'lucide-react'

interface FilePreviewProps {
  file: File
  previewUrl: string | null
  onRemove: () => void
  disabled?: boolean
}

export function FilePreview({
  file,
  previewUrl,
  onRemove,
  disabled = false,
}: FilePreviewProps) {
  return (
    <div className="space-y-4">
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-muted">
        {previewUrl && (
          
          <img
            src={previewUrl}
            alt="プレビュー"
            className="max-h-full max-w-full object-contain"
          />
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{file.name}</p>
          <p className="text-sm text-muted-foreground">
            {formatBytes(file.size)}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="rounded p-1 hover:bg-muted disabled:opacity-50"
          aria-label="ファイルを削除"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}
