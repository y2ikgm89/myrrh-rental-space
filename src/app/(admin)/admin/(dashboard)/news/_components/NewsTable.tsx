'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/admin/ui'
import { NewsStatusBadge } from '@/components/admin/status-badges'
import { publishNews, unpublishNews } from '@/actions/admin/news'
import type { NewsData } from '@/actions/admin/news'
import { NewsStatus } from '@/generated/prisma/client/enums'

type NewsTableProps = {
  news: NewsData[]
}

export function NewsTable({ news }: NewsTableProps) {
  const [isPending, startTransition] = useTransition()

  const handlePublish = (id: string) => {
    startTransition(async () => {
      const result = await publishNews(id)
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleUnpublish = (id: string) => {
    startTransition(async () => {
      const result = await unpublishNews(id)
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.error)
      }
    })
  }

  if (news.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-muted-foreground">お知らせがありません</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">ステータス</TableHead>
            <TableHead>タイトル</TableHead>
            <TableHead className="w-40">公開日時</TableHead>
            <TableHead className="w-40">作成日時</TableHead>
            <TableHead className="w-32">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {news.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <NewsStatusBadge status={item.status} />
              </TableCell>
              <TableCell>
                <div className="max-w-xs truncate font-medium">
                  {item.title}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {item.publishedAt
                  ? format(new Date(item.publishedAt), 'yyyy/MM/dd HH:mm', {
                      locale: ja,
                    })
                  : '-'}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {format(new Date(item.createdAt), 'yyyy/MM/dd HH:mm', {
                  locale: ja,
                })}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/news/${item.id}`}>編集</Link>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" disabled={isPending}>
                        •••
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {item.status === NewsStatus.PUBLISHED ? (
                        <DropdownMenuItem
                          onClick={() => handleUnpublish(item.id)}
                        >
                          下書きに戻す
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => handlePublish(item.id)}>
                          公開する
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
