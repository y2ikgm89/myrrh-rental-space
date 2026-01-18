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
} from '@/admin/components/ui'
import { InquiryStatusBadge } from '@/admin/components/status-badges'
import type { InquiryData } from '@/admin/actions/inquiry'

// =============================================================================
// Types
// =============================================================================

type InquiryTableProps = {
  inquiries: InquiryData[]
}

// =============================================================================
// InquiryTable Component (Server Component)
// =============================================================================

export function InquiryTable({ inquiries }: InquiryTableProps) {
  if (inquiries.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-muted-foreground">お問い合わせがありません</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ステータス</TableHead>
            <TableHead>件名</TableHead>
            <TableHead>お名前</TableHead>
            <TableHead>メールアドレス</TableHead>
            <TableHead>受付日時</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {inquiries.map((inquiry) => (
            <TableRow key={inquiry.id}>
              <TableCell>
                <InquiryStatusBadge status={inquiry.status} />
              </TableCell>
              <TableCell>
                <div className="max-w-xs truncate font-medium">
                  {inquiry.subject}
                </div>
              </TableCell>
              <TableCell className="font-medium">{inquiry.name}</TableCell>
              <TableCell>
                <a
                  href={`mailto:${inquiry.email}`}
                  className="text-primary hover:underline"
                >
                  {inquiry.email}
                </a>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {format(new Date(inquiry.createdAt), 'yyyy/MM/dd HH:mm', { locale: ja })}
              </TableCell>
              <TableCell>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/inquiries/${inquiry.id}`}>詳細</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
