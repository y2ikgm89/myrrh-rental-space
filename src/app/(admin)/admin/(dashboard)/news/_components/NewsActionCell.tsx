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
} from '@/admin/components/ui'
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
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href={`/admin/news/${newsId}`}>編集</Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={isPending}>
            <MoreHorizontal className="size-4" />
            <span className="sr-only">メニューを開く</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isPublished ? (
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
