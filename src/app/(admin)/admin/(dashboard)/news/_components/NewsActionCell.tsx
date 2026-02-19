'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { ActionDropdown, ActionDropdownItem } from '@/admin/components/ActionDropdown'
import { publishNews, unpublishNews } from '@/admin/actions/news'

type NewsActionCellProps = {
  newsId: string
  isPublished: boolean
}

export function NewsActionCell({ newsId, isPublished }: NewsActionCellProps) {
  const [isPending, startTransition] = useTransition()

  const handlePublish = () => {
    startTransition(async () => {
      const result = await publishNews(newsId)
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleUnpublish = () => {
    startTransition(async () => {
      const result = await unpublishNews(newsId)
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <ActionDropdown disabled={isPending}>
      <ActionDropdownItem href={`/admin/news/${newsId}`}>編集</ActionDropdownItem>
      {isPublished ? (
        <ActionDropdownItem onClick={handleUnpublish}>下書きに戻す</ActionDropdownItem>
      ) : (
        <ActionDropdownItem onClick={handlePublish}>公開する</ActionDropdownItem>
      )}
    </ActionDropdown>
  )
}
