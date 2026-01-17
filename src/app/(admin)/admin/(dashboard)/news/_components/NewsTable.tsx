import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/ui'
import { NewsStatusBadge } from '@/components/admin/status-badges'
import { NewsActionCell } from './NewsActionCell'
import type { NewsData } from '@/actions/admin/news'

// =============================================================================
// Types
// =============================================================================

type NewsTableProps = {
  news: NewsData[]
}

// =============================================================================
// NewsTable Component (Server Component)
// =============================================================================

export function NewsTable({ news }: NewsTableProps) {
  if (news.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-muted-foreground">お知らせがありません</p>
        <Button asChild className="mt-4">
          <Link href="/admin/news/new">新規作成</Link>
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
            <TableHead>公開日時</TableHead>
            <TableHead>作成日時</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {news.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <NewsStatusBadge status={item.status} />
              </TableCell>
              <TableCell>
                <div className="max-w-xs truncate font-medium">{item.title}</div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {item.publishedAt
                  ? format(new Date(item.publishedAt), 'yyyy/MM/dd HH:mm', { locale: ja })
                  : '-'}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {format(new Date(item.createdAt), 'yyyy/MM/dd HH:mm', { locale: ja })}
              </TableCell>
              <TableCell>
                <NewsActionCell newsId={item.id} status={item.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
