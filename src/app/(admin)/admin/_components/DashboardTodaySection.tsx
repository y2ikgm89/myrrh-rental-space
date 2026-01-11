/**
 * 本日の予約セクション
 */

import { getTodayReservations } from '@/actions/admin/dashboard'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/admin/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/ui/table'
import { ReservationStatusBadge } from '@/components/admin/status-badges'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { ReservationStatus } from '@/generated/prisma/client/enums'

export async function DashboardTodaySection() {
  const todayReservations = await getTodayReservations()

  if (todayReservations.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>本日の予約</CardTitle>
        <CardDescription>
          {todayReservations.length}件の予約があります
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>時間</TableHead>
              <TableHead>スペース</TableHead>
              <TableHead>お客様</TableHead>
              <TableHead>ステータス</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {todayReservations.map((reservation) => (
              <TableRow key={reservation.id}>
                <TableCell>
                  {format(reservation.startTime, 'HH:mm', { locale: ja })} -{' '}
                  {format(reservation.endTime, 'HH:mm', { locale: ja })}
                </TableCell>
                <TableCell>{reservation.spaceName}</TableCell>
                <TableCell>{reservation.customerName}</TableCell>
                <TableCell>
                  <ReservationStatusBadge status={reservation.status as ReservationStatus} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
