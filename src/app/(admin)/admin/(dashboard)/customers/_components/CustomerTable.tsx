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
import { CustomerStatusBadge } from '@/admin/components/status-badges'
import { formatDateShort } from '@/shared/lib/utils'
import type { CustomerData } from '@/admin/actions/customer'

// =============================================================================
// Types
// =============================================================================

type CustomerTableProps = {
  customers: CustomerData[]
}

// =============================================================================
// CustomerTable Component (Server Component)
// =============================================================================

export function CustomerTable({ customers }: CustomerTableProps) {
  if (customers.length === 0) {
    return (
      <EmptyState
        message="顧客がいません"
        action={{ label: '新規顧客', href: '/admin/customers/new' }}
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ステータス</TableHead>
            <TableHead>お名前</TableHead>
            <TableHead>メールアドレス</TableHead>
            <TableHead>電話番号</TableHead>
            <TableHead className="text-right">予約数</TableHead>
            <TableHead>最終予約</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => (
            <TableRow key={customer.id}>
              <TableCell>
                <CustomerStatusBadge status={customer.status} />
              </TableCell>
              <TableCell className="font-medium">
                {customer.lastName} {customer.firstName}
              </TableCell>
              <TableCell>
                <a
                  href={`mailto:${customer.email}`}
                  className="text-primary hover:underline"
                >
                  {customer.email}
                </a>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {customer.phoneNumber || '-'}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {customer.totalReservations}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {customer.lastReservationAt
                  ? formatDateShort(customer.lastReservationAt)
                  : '-'}
              </TableCell>
              <TableCell>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/customers/${customer.id}`}>詳細</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
