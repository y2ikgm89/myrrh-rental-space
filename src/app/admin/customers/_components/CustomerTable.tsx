'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Button,
} from '@/components/admin/ui'
import { StatusBadge } from './StatusBadge'
import type { CustomerData } from '@/actions/admin/customer'

type CustomerTableProps = {
  customers: CustomerData[]
}

export function CustomerTable({ customers }: CustomerTableProps) {
  if (customers.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-muted-foreground">顧客がいません</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">ステータス</TableHead>
            <TableHead>お名前</TableHead>
            <TableHead className="w-48">メールアドレス</TableHead>
            <TableHead className="w-32">電話番号</TableHead>
            <TableHead className="w-24">予約数</TableHead>
            <TableHead className="w-36">最終予約</TableHead>
            <TableHead className="w-24">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => (
            <TableRow key={customer.id} className={!customer.isActive ? 'opacity-50' : ''}>
              <TableCell>
                <StatusBadge status={customer.status} />
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
              <TableCell className="text-muted-foreground">
                {customer.totalReservations}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {customer.lastReservationAt
                  ? format(new Date(customer.lastReservationAt), 'yyyy/MM/dd', {
                      locale: ja,
                    })
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
