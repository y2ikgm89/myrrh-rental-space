'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
} from '@/admin/components/ui'
import { DeleteConfirmDialog } from '@/admin/components/DeleteConfirmDialog'
import { ReservationStatusBadge } from '@/admin/components/status-badges'
import {
  updateReservationStatus,
  updateReservationNotes,
  deleteReservation,
} from '@/admin/actions/reservation'
import type { ReservationWithRelations } from '@/admin/actions/reservation'
import {
  isValidReservationStatus,
  type ReservationStatus,
} from '@/shared/lib/validations/enums'
import { formatDateTimeFull, formatPrice } from '@/shared/lib/utils'

type ReservationDetailProps = {
  reservation: ReservationWithRelations
}

export function ReservationDetail({ reservation }: ReservationDetailProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [notes, setNotes] = useState(reservation.notes || '')
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const handleStatusChange = async (newStatus: ReservationStatus) => {
    if (newStatus === reservation.status) return

    startTransition(async () => {
      const result = await updateReservationStatus(reservation.id, newStatus)
      if (result.success) {
        router.refresh()
      } else {
        toast.error(result.error || 'エラーが発生しました')
      }
    })
  }

  const handleNotesUpdate = async () => {
    startTransition(async () => {
      const result = await updateReservationNotes(reservation.id, notes || null)
      if (result.success) {
        router.refresh()
      } else {
        toast.error(result.error || 'エラーが発生しました')
      }
    })
  }

  const handleDelete = async () => {
    startTransition(async () => {
      const result = await deleteReservation(reservation.id)
      if (result.success) {
        router.push('/admin/reservations')
      } else {
        toast.error(result.error || 'エラーが発生しました')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* ステータス・操作 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>ステータス</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/reservations/${reservation.id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" />
                編集
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <ReservationStatusBadge status={reservation.status} />
            <Select
              value={reservation.status}
              onValueChange={(value) => {
                if (isValidReservationStatus(value)) handleStatusChange(value)
              }}
              disabled={isPending}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="ステータスを変更" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">保留中に変更</SelectItem>
                <SelectItem value="CONFIRMED">確認済みに変更</SelectItem>
                <SelectItem value="CANCELLED">キャンセルに変更</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 予約情報 */}
      <Card>
        <CardHeader>
          <CardTitle>予約情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm text-muted-foreground">スペース</div>
              <div className="font-medium">{reservation.space.name}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">料金</div>
              <div className="font-medium">
                {formatPrice(reservation.totalPrice)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">開始日時</div>
              <div className="font-medium">
                {formatDateTimeFull(reservation.startTime)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">終了日時</div>
              <div className="font-medium">
                {formatDateTimeFull(reservation.endTime)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">作成日時</div>
              <div className="font-medium">
                {formatDateTimeFull(reservation.createdAt)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">更新日時</div>
              <div className="font-medium">
                {formatDateTimeFull(reservation.updatedAt)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 顧客情報 */}
      <Card>
        <CardHeader>
          <CardTitle>顧客情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm text-muted-foreground">氏名</div>
              <div className="font-medium">
                {reservation.customer.lastName} {reservation.customer.firstName}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">メールアドレス</div>
              <div className="font-medium">{reservation.customer.email}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">電話番号</div>
              <div className="font-medium">
                {reservation.customer.phoneNumber || '-'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* メモ */}
      <Card>
        <CardHeader>
          <CardTitle>メモ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="メモを入力..."
            disabled={isPending}
          />
          <Button
            onClick={handleNotesUpdate}
            disabled={isPending || notes === (reservation.notes || '')}
          >
            メモを保存
          </Button>
        </CardContent>
      </Card>

      {/* 危険な操作 */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">危険な操作</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            予約を削除
          </Button>
          <DeleteConfirmDialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            description="予約データは完全に削除されます。この操作は取り消せません。"
            onConfirm={handleDelete}
            isPending={isPending}
          />
        </CardContent>
      </Card>
    </div>
  )
}
