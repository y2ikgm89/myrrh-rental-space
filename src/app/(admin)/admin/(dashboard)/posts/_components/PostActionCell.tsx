'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from '@/admin/components/ActionDropdown'
import { publishPost, unpublishPost } from '@/admin/actions/post'
import { PostStatus } from '@/shared/db/enums'

type PostActionCellProps = {
  postId: string
  status: PostStatus
}

export function PostActionCell({ postId, status }: PostActionCellProps) {
  const [isPending, startTransition] = useTransition()

  const handlePublish = () => {
    startTransition(async () => {
      const result = await publishPost(postId)
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleUnpublish = () => {
    startTransition(async () => {
      const result = await unpublishPost(postId)
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <ActionDropdown disabled={isPending}>
      <ActionDropdownItem href={`/admin/posts/${postId}/edit`}>編集</ActionDropdownItem>
      <ActionDropdownSeparator />
      {status === PostStatus.PUBLISHED ? (
        <ActionDropdownItem onClick={handleUnpublish}>下書きに戻す</ActionDropdownItem>
      ) : (
        <ActionDropdownItem onClick={handlePublish}>公開する</ActionDropdownItem>
      )}
    </ActionDropdown>
  )
}
