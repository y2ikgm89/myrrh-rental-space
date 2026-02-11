import Link from 'next/link'
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/admin/components/ui'
import { EmptyState } from '@/admin/components/EmptyState'
import { InquiryStatusBadge } from '@/admin/components/status-badges'
import { formatDateTimeShort } from '@/shared/lib/utils'
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
    return <EmptyState message="お問い合わせがありません" />
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ステータス</TableHead>
            <TableHead>件名</TableHead>
            <TableHead className="hidden md:table-cell">お名前</TableHead>
            <TableHead className="hidden lg:table-cell">メールアドレス</TableHead>
            <TableHead className="hidden md:table-cell">受付日時</TableHead>
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
              <TableCell className="hidden font-medium md:table-cell">{inquiry.name}</TableCell>
              <TableCell className="hidden lg:table-cell">
                <a
                  href={`mailto:${inquiry.email}`}
                  className="text-primary hover:underline"
                >
                  {inquiry.email}
                </a>
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {formatDateTimeShort(inquiry.createdAt)}
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
