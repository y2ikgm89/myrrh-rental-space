'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowLeft, Pencil } from 'lucide-react'
import { formatDateShort, formatDateTimeShort, formatPrice } from '@/shared/lib/utils'
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
  Switch,
  Label,
} from '@/admin/components/ui'
import { CustomerStatusBadge, ReservationStatusBadge } from '@/admin/components/status-badges'
import {
  updateCustomerStatus,
  updateCustomerNotes,
  toggleCustomerActive,
} from '@/admin/actions/customer'
import type { CustomerWithReservations } from '@/admin/actions/customer'
import {
  isValidCustomerStatus,
  type CustomerStatus,
} from '@/shared/lib/validations/enums'

type CustomerDetailProps = {
  customer: CustomerWithReservations
}

export function CustomerDetail({ customer }: CustomerDetailProps) {
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
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/customers">
              <ArrowLeft className="mr-2 h-4 w-4" />
              一覧に戻る
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {customer.lastName} {customer.firstName}
            </h1>
            <p className="text-muted-foreground">
              登録日: {formatDateShort(customer.createdAt)}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/customers/${customer.id}/edit`}>
            <Pencil className="mr-2 h-4 w-4" />
            編集
          </Link>
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
                  {formatPrice(customer.totalSpent, '-')}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">最終予約日</p>
                <p className="text-lg">
                  {formatDateShort(customer.lastReservationAt)}
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
                          {formatDateTimeShort(reservation.startTime)}
                          {' - '}
                          {new Date(reservation.endTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                        <TableCell>
                          {formatPrice(reservation.totalPrice, '-')}
                        </TableCell>
                        <TableCell>
                          <ReservationStatusBadge status={reservation.status} />
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
                <CustomerStatusBadge status={customer.status} />
              </div>
              <Select
                value={customer.status}
                onValueChange={(value) => {
                  if (isValidCustomerStatus(value)) handleStatusChange(value)
                }}
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
