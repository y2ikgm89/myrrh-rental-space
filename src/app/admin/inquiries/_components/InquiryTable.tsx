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
import type { InquiryData } from '@/actions/admin/inquiry'

type InquiryTableProps = {
  inquiries: InquiryData[]
}

export function InquiryTable({ inquiries }: InquiryTableProps) {
  if (inquiries.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-muted-foreground">お問い合わせがありません</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">ステータス</TableHead>
            <TableHead>件名</TableHead>
            <TableHead className="w-40">お名前</TableHead>
            <TableHead className="w-48">メールアドレス</TableHead>
            <TableHead className="w-40">受付日時</TableHead>
            <TableHead className="w-24">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {inquiries.map((inquiry) => (
            <TableRow key={inquiry.id}>
              <TableCell>
                <StatusBadge status={inquiry.status} />
              </TableCell>
              <TableCell>
                <div className="max-w-xs truncate font-medium">
                  {inquiry.subject}
                </div>
              </TableCell>
              <TableCell>{inquiry.name}</TableCell>
              <TableCell>
                <a
                  href={`mailto:${inquiry.email}`}
                  className="text-primary hover:underline"
                >
                  {inquiry.email}
                </a>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {format(new Date(inquiry.createdAt), 'yyyy/MM/dd HH:mm', {
                  locale: ja,
                })}
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
