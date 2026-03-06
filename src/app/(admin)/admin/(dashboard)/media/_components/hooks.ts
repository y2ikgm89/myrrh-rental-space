/**
 * メディア管理 - 共通フック
 */

'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { useConfirm } from '@/admin/contexts/confirm-context'
import { deleteMedia } from '@/admin/actions/media'
import type { MediaData } from '@/admin/types/media-picker'

/**
 * URLコピー機能
 */
export function createCopyUrlHandler(): (url: string) => Promise<void> {
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
  const confirm = useConfirm()

  const handleDelete = async (item: MediaData) => {
    const confirmed = await confirm({
      title: 'メディアを削除しますか？',
      description: `「${item.filename}」を削除します。この操作は元に戻せません。`,
      confirmLabel: '削除',
      variant: 'destructive',
    })
    if (!confirmed) return

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
