/**
 * メディア管理 - 共通フック
 */

'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { deleteMedia, type MediaData } from '@/admin/actions/media'

/**
 * URLコピー機能
 */
export function useCopyUrl(): (url: string) => Promise<void> {
  return async (url: string) => {
    await navigator.clipboard.writeText(url)
    toast.success('URLをコピーしました')
  }
}

/**
 * メディア削除機能
 */
export function useDeleteMedia(): {
  handleDelete: (item: MediaData) => void
  isPending: boolean
} {
  const [isPending, startTransition] = useTransition()

  const handleDelete = (item: MediaData) => {
    if (!confirm(`「${item.filename}」を削除しますか？`)) return

    startTransition(async () => {
      const result = await deleteMedia(item.id)
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.error)
      }
    })
  }

  return { handleDelete, isPending }
}
