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
import { CustomerStatusBadge } from '@/components/admin/status-badges'
import type { CustomerData } from '@/actions/admin/customer'

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
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-muted-foreground">顧客がいません</p>
      </div>
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
                  ? format(new Date(customer.lastReservationAt), 'yyyy/MM/dd', { locale: ja })
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
