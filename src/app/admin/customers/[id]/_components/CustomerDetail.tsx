'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  Switch,
  Label,
} from '@/components/admin/ui'
import { StatusBadge } from '../../_components/StatusBadge'
import {
  updateCustomerStatus,
  updateCustomerNotes,
  toggleCustomerActive,
} from '@/actions/admin/customer'
import type { CustomerWithReservations } from '@/actions/admin/customer'
import type { CustomerStatus } from '@/generated/prisma/client/enums'

type CustomerDetailProps = {
  customer: CustomerWithReservations
}

const reservationStatusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PENDING: { label: '保留中', variant: 'outline' },
  CONFIRMED: { label: '確認済み', variant: 'default' },
  CANCELLED: { label: 'キャンセル', variant: 'destructive' },
}

export function CustomerDetail({ customer }: CustomerDetailProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [notes, setNotes] = useState(customer.notes || '')

  const handleStatusChange = async (status: CustomerStatus) => {
    startTransition(async () => {
      const result = await updateCustomerStatus(customer.id, status)
      if (!result.success) {
        toast.error(result.error)
      }
    })
  }

  const handleNotesUpdate = async () => {
    startTransition(async () => {
      const result = await updateCustomerNotes(customer.id, notes || null)
      if (!result.success) {
        toast.error(result.error)
      }
    })
  }

  const handleToggleActive = async () => {
    startTransition(async () => {
      const result = await toggleCustomerActive(customer.id)
      if (!result.success) {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {customer.lastName} {customer.firstName}
          </h1>
          <p className="text-muted-foreground">
            登録日:{' '}
            {format(new Date(customer.createdAt), 'yyyy年MM月dd日', {
              locale: ja,
            })}
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push('/admin/customers')}>
          一覧に戻る
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* 顧客情報 */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>基本情報</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">お名前</p>
                <p className="font-medium">
                  {customer.lastName} {customer.firstName}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">メールアドレス</p>
                <a
                  href={`mailto:${customer.email}`}
                  className="text-primary hover:underline"
                >
                  {customer.email}
                </a>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">電話番号</p>
                <p>{customer.phoneNumber || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">住所</p>
                <p>{customer.address || '-'}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>統計情報</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">予約回数</p>
                <p className="text-2xl font-bold">{customer.totalReservations}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">累計利用金額</p>
                <p className="text-2xl font-bold">
                  {customer.totalSpent
                    ? `¥${customer.totalSpent.toLocaleString()}`
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">最終予約日</p>
                <p className="text-lg">
                  {customer.lastReservationAt
                    ? format(new Date(customer.lastReservationAt), 'yyyy/MM/dd', {
                        locale: ja,
                      })
                    : '-'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 予約履歴 */}
          <Card>
            <CardHeader>
              <CardTitle>予約履歴（最新20件）</CardTitle>
            </CardHeader>
            <CardContent>
              {customer.reservations.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  予約履歴がありません
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>スペース</TableHead>
                      <TableHead>日時</TableHead>
                      <TableHead>金額</TableHead>
                      <TableHead>ステータス</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customer.reservations.map((reservation) => (
                      <TableRow key={reservation.id}>
                        <TableCell className="font-medium">
                          {reservation.space.name}
                        </TableCell>
                        <TableCell>
                          {format(
                            new Date(reservation.startTime),
                            'yyyy/MM/dd HH:mm',
                            { locale: ja }
                          )}
                          {' - '}
                          {format(new Date(reservation.endTime), 'HH:mm', {
                            locale: ja,
                          })}
                        </TableCell>
                        <TableCell>
                          {reservation.totalPrice
                            ? `¥${reservation.totalPrice.toLocaleString()}`
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              reservationStatusLabels[reservation.status]?.variant || 'outline'
                            }
                          >
                            {reservationStatusLabels[reservation.status]?.label ||
                              reservation.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/admin/reservations/${reservation.id}`}>
                              詳細
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* サイドバー */}
        <div className="space-y-6">
          {/* ステータス */}
          <Card>
            <CardHeader>
              <CardTitle>ステータス</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">現在:</span>
                <StatusBadge status={customer.status} />
              </div>
              <Select
                value={customer.status}
                onValueChange={(value) =>
                  handleStatusChange(value as CustomerStatus)
                }
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="ステータスを変更" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NEW">新規</SelectItem>
                  <SelectItem value="REGULAR">リピーター</SelectItem>
                  <SelectItem value="VIP">VIP</SelectItem>
                  <SelectItem value="INACTIVE">休眠</SelectItem>
                  <SelectItem value="BLACKLIST">ブラックリスト</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center justify-between pt-2 border-t">
                <Label htmlFor="isActive">アクティブ</Label>
                <Switch
                  id="isActive"
                  checked={customer.isActive}
                  onCheckedChange={handleToggleActive}
                  disabled={isPending}
                />
              </div>
            </CardContent>
          </Card>

          {/* メモ */}
          <Card>
            <CardHeader>
              <CardTitle>メモ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="顧客に関するメモ..."
                rows={5}
                disabled={isPending}
              />
              <Button
                onClick={handleNotesUpdate}
                disabled={isPending}
                className="w-full"
              >
                {isPending ? '保存中...' : 'メモを保存'}
              </Button>
            </CardContent>
          </Card>

          {/* アクション */}
          <Card>
            <CardHeader>
              <CardTitle>アクション</CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <a href={`mailto:${customer.email}`}>メールを送信</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
