/**
 * 最近の予約・お問い合わせセクション
 */

import Link from 'next/link'
import { getRecentReservations, getRecentInquiries } from '@/admin/actions/dashboard'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/admin/components/ui/card'
import { Button } from '@/admin/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/admin/components/ui/table'
import {
  ReservationStatusBadge,
  InquiryStatusBadge,
} from '@/admin/components/status-badges'
import { EmptyState } from '@/admin/components/EmptyState'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

export async function DashboardRecentSection() {
  // 関連データを並列取得
  const [recentReservations, recentInquiries] = await Promise.all([
    getRecentReservations(5),
    getRecentInquiries(5),
  ])

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* 最近の予約 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>最近の予約</CardTitle>
            <CardDescription>直近5件</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/reservations">すべて表示</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentReservations.length === 0 ? (
            <EmptyState message="予約データがありません" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日時</TableHead>
                  <TableHead>スペース</TableHead>
                  <TableHead>ステータス</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentReservations.map((reservation) => (
                  <TableRow key={reservation.id}>
                    <TableCell className="text-sm">
                      {format(reservation.startTime, 'M/d HH:mm', { locale: ja })}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/reservations/${reservation.id}`}
                        className="hover:underline"
                      >
                        {reservation.spaceName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <ReservationStatusBadge status={reservation.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 最近のお問い合わせ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>最近のお問い合わせ</CardTitle>
            <CardDescription>直近5件</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/inquiries">すべて表示</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentInquiries.length === 0 ? (
            <EmptyState message="お問い合わせデータがありません" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日時</TableHead>
                  <TableHead>件名</TableHead>
                  <TableHead>ステータス</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentInquiries.map((inquiry) => (
                  <TableRow key={inquiry.id}>
                    <TableCell className="text-sm">
                      {format(inquiry.createdAt, 'M/d HH:mm', { locale: ja })}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/inquiries/${inquiry.id}`}
                        className="hover:underline"
                      >
                        {inquiry.subject}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <InquiryStatusBadge status={inquiry.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
