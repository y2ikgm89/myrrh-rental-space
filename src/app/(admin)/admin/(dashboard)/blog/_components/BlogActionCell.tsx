'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/admin/ui'
import { publishBlogPost, unpublishBlogPost } from '@/actions/admin/blog'
import { BlogPostStatus } from '@/generated/prisma/client/enums'

type BlogActionCellProps = {
  postId: string
  status: BlogPostStatus
}

export function BlogActionCell({ postId, status }: BlogActionCellProps) {
  const [isPending, startTransition] = useTransition()

  const handlePublish = () => {
    startTransition(async () => {
      const result = await publishBlogPost(postId)
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleUnpublish = () => {
    startTransition(async () => {
      const result = await unpublishBlogPost(postId)
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href={`/admin/blog/${postId}`}>編集</Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={isPending}>
            <MoreHorizontal className="size-4" />
            <span className="sr-only">メニューを開く</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {status === BlogPostStatus.PUBLISHED ? (
            <DropdownMenuItem onClick={handleUnpublish}>
              下書きに戻す
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={handlePublish}>
              公開する
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
