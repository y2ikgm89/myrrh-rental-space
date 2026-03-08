'use client'

/**
 * DropZone
 *
 * ファイルドラッグ&ドロップエリア
 */

import { useState } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '@/shared/lib/cn'

interface DropZoneProps {
  onDrop: (file: File) => void
  accept?: string
  disabled?: boolean
}

export function DropZone({
  onDrop,
  accept = 'image/*',
  disabled = false,
}: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    if (disabled) return

    const file = e.dataTransfer.files[0]
    if (file) {
      onDrop(file)
    }
  }

  const handleClick = () => {
    if (disabled) return
    document.getElementById('media-picker-file-input')?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onDrop(file)
      e.target.value = ''
    }
  }

  return (
    <div
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors',
        isDragOver
          ? 'border-primary bg-primary/5'
          : 'hover:border-primary hover:bg-primary/5',
        disabled && 'cursor-not-allowed opacity-50'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <Upload className="mb-2 h-12 w-12 text-muted-foreground" />
      <p className="text-muted-foreground">
        ドラッグ&ドロップ または クリックして選択
      </p>
      <input
        id="media-picker-file-input"
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />
    </div>
  )
}
