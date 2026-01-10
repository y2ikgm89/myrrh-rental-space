/**
 * 管理画面ダッシュボード
 */

import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import Link from 'next/link'
import { LoginTokenGenerator } from './_components/LoginTokenGenerator'
import { AnalyticsCard } from './_components/AnalyticsCard'
import {
  getDashboardStats,
  getRecentReservations,
  getRecentInquiries,
  getTodayReservations,
} from '@/actions/admin/dashboard'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/admin/ui/card'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/ui/table'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { ReservationStatus, InquiryStatus } from '@/generated/prisma/client/enums'

export const metadata: Metadata = {
  title: 'ダッシュボード | 管理画面',
}

export default async function AdminDashboard(): Promise<ReactElement> {
  const [stats, recentReservations, recentInquiries, todayReservations] = await Promise.all([
    getDashboardStats(),
    getRecentReservations(5),
    getRecentInquiries(5),
    getTodayReservations(),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ダッシュボード</h1>
          <p className="text-muted-foreground">
            {format(new Date(), 'yyyy年M月d日 (EEEE)', { locale: ja })}
          </p>
        </div>
        <LoginTokenGenerator />
      </div>

      {/* 統計カード */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">今月の予約</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.reservations.thisMonth}件</div>
            <p className={`text-xs ${getChangeColor(stats.reservations.changePercent)}`}>
              {formatChange(stats.reservations.changePercent)} 前月比
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">今月の売上</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats.revenue.thisMonth)}
            </div>
            <p className={`text-xs ${getChangeColor(stats.revenue.changePercent)}`}>
              {formatChange(stats.revenue.changePercent)} 前月比
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">新規お問い合わせ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inquiries.new}件</div>
            <p className="text-xs text-muted-foreground">
              今月計: {stats.inquiries.thisMonth}件
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">アクティブスペース</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.spaces.active}件</div>
            <p className="text-xs text-muted-foreground">
              全{stats.spaces.total}件中
            </p>
          </CardContent>
        </Card>
      </div>

      {/* アクセス解析 */}
      <AnalyticsCard />

      {/* 本日の予約 */}
      {todayReservations.length > 0 && (
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
                      {format(reservation.startTime, 'HH:mm', { locale: ja })} - {format(reservation.endTime, 'HH:mm', { locale: ja })}
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
      )}

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
              <p className="text-muted-foreground text-sm">予約データがありません</p>
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
                        <ReservationStatusBadge status={reservation.status as ReservationStatus} />
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
              <p className="text-muted-foreground text-sm">お問い合わせデータがありません</p>
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
                        <InquiryStatusBadge status={inquiry.status as InquiryStatus} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function getChangeColor(change: number): string {
  if (change > 0) return 'text-green-600'
  if (change < 0) return 'text-red-600'
  return 'text-muted-foreground'
}

function formatChange(change: number): string {
  if (change > 0) return `+${change}%`
  if (change < 0) return `${change}%`
  return '0%'
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
  }).format(value)
}

function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  switch (status) {
    case 'PENDING':
      return <Badge variant="secondary">保留中</Badge>
    case 'CONFIRMED':
      return <Badge variant="default">確定</Badge>
    case 'CANCELLED':
      return <Badge variant="destructive">キャンセル</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function InquiryStatusBadge({ status }: { status: InquiryStatus }) {
  switch (status) {
    case 'NEW':
      return <Badge variant="default">新規</Badge>
    case 'IN_PROGRESS':
      return <Badge variant="secondary">対応中</Badge>
    case 'RESOLVED':
      return <Badge variant="outline">解決済み</Badge>
    case 'CLOSED':
      return <Badge variant="outline">クローズ</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}
