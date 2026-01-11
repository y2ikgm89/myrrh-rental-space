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
  Switch,
} from '@/components/admin/ui'
import { PublishStatusBadge } from '@/components/admin/status-badges'
import { toggleNewsPublish } from '@/actions/admin/news'
import type { NewsData } from '@/actions/admin/news'

type NewsTableProps = {
  news: NewsData[]
}

export function NewsTable({ news }: NewsTableProps) {
  const [isPending, startTransition] = useTransition()

  const handleTogglePublish = (id: string) => {
    startTransition(async () => {
      const result = await toggleNewsPublish(id)
      if (!result.success) {
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
            <TableHead className="w-24">公開</TableHead>
            <TableHead className="w-32">ステータス</TableHead>
            <TableHead>タイトル</TableHead>
            <TableHead className="w-40">公開日時</TableHead>
            <TableHead className="w-40">作成日時</TableHead>
            <TableHead className="w-24">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {news.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <Switch
                  checked={item.isPublished}
                  onCheckedChange={() => handleTogglePublish(item.id)}
                  disabled={isPending}
                />
              </TableCell>
              <TableCell>
                <PublishStatusBadge isPublished={item.isPublished} />
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
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/news/${item.id}`}>編集</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
