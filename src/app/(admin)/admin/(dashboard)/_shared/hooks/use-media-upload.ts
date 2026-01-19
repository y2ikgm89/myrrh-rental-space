'use client'

/**
 * useMediaUpload
 *
 * メディアアップロードを管理するフック
 */

import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { uploadMedia } from '@/admin/actions/media'
import {
  validateFile,
  inferMediaType,
  type MediaUsage,
} from '@/admin/lib/validations/media'
import type { MediaMetadata } from '@/admin/types/media-picker'

/** アップロード結果 */
export interface UploadResult {
  id: string
  url: string
}

interface UseMediaUploadReturn {
  uploadFile: (
    file: File,
    metadata: MediaMetadata,
    usage: MediaUsage
  ) => Promise<UploadResult | null>
  isUploading: boolean
  previewUrl: string | null
  setPreviewFile: (file: File | null) => void
  clearPreview: () => void
}

export function useMediaUpload(): UseMediaUploadReturn {
  const [isUploading, setIsUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const fileReaderRef = useRef<FileReader | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (fileReaderRef.current) {
        fileReaderRef.current.abort()
      }
    }
  }, [])

  const setPreviewFile = (file: File | null) => {
    if (!file) {
      setPreviewUrl(null)
      return
    }

    const type = inferMediaType(file.type)
    const validation = validateFile(file, type)

    if (!validation.valid) {
      toast.error(validation.error)
      return
    }

    if (!file.type.startsWith('image/')) {
      toast.error('画像ファイルを選択してください')
      return
    }

    if (fileReaderRef.current) {
      fileReaderRef.current.abort()
    }

    const reader = new FileReader()
    fileReaderRef.current = reader

    reader.onload = (e) => {
      if (!isMountedRef.current) return
      setPreviewUrl(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const clearPreview = () => {
    setPreviewUrl(null)
  }

  const uploadFile = async (
    file: File,
    metadata: MediaMetadata,
    usage: MediaUsage
  ): Promise<UploadResult | null> => {
    const type = inferMediaType(file.type)
    const validation = validateFile(file, type)

    if (!validation.valid) {
      toast.error(validation.error)
      return null
    }

    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('usage', usage)
      if (metadata.alt) formData.append('alt', metadata.alt)
      if (metadata.title) formData.append('title', metadata.title)
      if (metadata.description)
        formData.append('description', metadata.description)

      const result = await uploadMedia(formData)

      if (!result.success) {
        toast.error(result.error)
        return null
      }

      toast.success('アップロードしました')
      return result.data
    } finally {
      if (isMountedRef.current) {
        setIsUploading(false)
      }
    }
  }

  return {
    uploadFile,
    isUploading,
    previewUrl,
    setPreviewFile,
    clearPreview,
  }
}
