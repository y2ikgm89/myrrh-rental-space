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
  Badge,
} from '@/components/admin/ui'
import { PublishStatusBadge } from '@/components/admin/status-badges'
import { toggleBlogPostPublish } from '@/actions/admin/blog'
import type { BlogPostData } from '@/actions/admin/blog'

type BlogTableProps = {
  posts: BlogPostData[]
}

export function BlogTable({ posts }: BlogTableProps) {
  const [isPending, startTransition] = useTransition()

  const handleTogglePublish = (id: string) => {
    startTransition(async () => {
      const result = await toggleBlogPostPublish(id)
      if (!result.success) {
        toast.error(result.error)
      }
    })
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-muted-foreground">ブログ記事がありません</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">公開</TableHead>
            <TableHead className="w-24">ステータス</TableHead>
            <TableHead>タイトル</TableHead>
            <TableHead className="w-32">カテゴリ</TableHead>
            <TableHead className="w-24">PV</TableHead>
            <TableHead className="w-36">公開日時</TableHead>
            <TableHead className="w-24">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts.map((post) => (
            <TableRow key={post.id}>
              <TableCell>
                <Switch
                  checked={post.isPublished}
                  onCheckedChange={() => handleTogglePublish(post.id)}
                  disabled={isPending}
                />
              </TableCell>
              <TableCell>
                <PublishStatusBadge isPublished={post.isPublished} />
              </TableCell>
              <TableCell>
                <div className="max-w-xs truncate font-medium">
                  {post.title}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  /{post.slug}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{post.category.name}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {post.viewCount.toLocaleString()}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {post.publishedAt
                  ? format(new Date(post.publishedAt), 'yyyy/MM/dd HH:mm', {
                      locale: ja,
                    })
                  : '-'}
              </TableCell>
              <TableCell>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/blog/${post.id}`}>編集</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
