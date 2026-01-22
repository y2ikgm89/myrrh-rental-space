import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/admin/components/ui'
import { EmptyState } from '@/admin/components/EmptyState'
import { BlogPostStatusBadge } from '@/admin/components/status-badges'
import { BlogActionCell } from './BlogActionCell'
import { formatDateTimeShort } from '@/shared/lib/utils'
import type { BlogPostData } from '@/admin/actions/blog'

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
      <EmptyState
        message="ブログ記事がありません"
        action={{ label: '新規作成', href: '/admin/blog/new' }}
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ステータス</TableHead>
            <TableHead>タイトル</TableHead>
            <TableHead className="hidden md:table-cell">カテゴリ</TableHead>
            <TableHead className="hidden text-right lg:table-cell">PV</TableHead>
            <TableHead className="hidden md:table-cell">公開日時</TableHead>
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
              <TableCell className="hidden md:table-cell">
                <Badge variant="outline">{post.category.name}</Badge>
              </TableCell>
              <TableCell className="hidden text-right text-muted-foreground lg:table-cell">
                {post.viewCount.toLocaleString()}
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {post.publishedAt ? formatDateTimeShort(post.publishedAt) : '-'}
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
