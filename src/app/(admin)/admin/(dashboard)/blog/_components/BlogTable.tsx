import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  Button,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/ui'
import { BlogPostStatusBadge } from '@/components/admin/status-badges'
import { BlogActionCell } from './BlogActionCell'
import type { BlogPostData } from '@/actions/admin/blog'

// =============================================================================
// Types
// =============================================================================

type BlogTableProps = {
  posts: BlogPostData[]
}

// =============================================================================
// BlogTable Component (Server Component)
// =============================================================================

export function BlogTable({ posts }: BlogTableProps) {
  if (posts.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-muted-foreground">ブログ記事がありません</p>
        <Button asChild className="mt-4">
          <Link href="/admin/blog/new">新規作成</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ステータス</TableHead>
            <TableHead>タイトル</TableHead>
            <TableHead>カテゴリ</TableHead>
            <TableHead className="text-right">PV</TableHead>
            <TableHead>公開日時</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts.map((post) => (
            <TableRow key={post.id}>
              <TableCell>
                <BlogPostStatusBadge status={post.status} />
              </TableCell>
              <TableCell>
                <div>
                  <div className="max-w-xs truncate font-medium">{post.title}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    /{post.slug}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{post.category.name}</Badge>
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {post.viewCount.toLocaleString()}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {post.publishedAt
                  ? format(new Date(post.publishedAt), 'yyyy/MM/dd HH:mm', { locale: ja })
                  : '-'}
              </TableCell>
              <TableCell>
                <BlogActionCell postId={post.id} status={post.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
