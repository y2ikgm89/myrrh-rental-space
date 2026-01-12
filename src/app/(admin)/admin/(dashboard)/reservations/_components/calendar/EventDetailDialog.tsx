'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Clock, MapPin, User, Mail, Phone, FileText, ExternalLink } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/admin/ui'
import { ReservationStatusBadge } from '@/components/admin/status-badges'
import type { CalendarEvent } from '@/lib/calendar'
import type { ReservationStatus } from '@/generated/prisma/client/enums'

interface EventDetailDialogProps {
  event: CalendarEvent | null
  isPending: boolean
  onClose: () => void
  onStatusChange: (eventId: string, status: ReservationStatus) => void
}

export function EventDetailDialog({
  event,
  isPending,
  onClose,
  onStatusChange,
}: EventDetailDialogProps) {
  if (!event) return null

  const handleStatusChange = (status: ReservationStatus) => {
    onStatusChange(event.id, status)
  }

  const formatPrice = (price: number | null) => {
    if (price === null) return '-'
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
    }).format(price)
  }

  return (
    <Dialog open={!!event} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{event.title}</span>
            <ReservationStatusBadge status={event.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 日時 */}
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">
                {format(event.startTime, 'yyyy年M月d日 (E)', { locale: ja })}
              </div>
              <div className="text-sm text-muted-foreground">
                {format(event.startTime, 'HH:mm')} -{' '}
                {format(event.endTime, 'HH:mm')}
              </div>
            </div>
          </div>

          {/* スペース */}
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">{event.spaceName}</div>
              <div className="text-sm text-muted-foreground">
                {formatPrice(event.totalPrice)}
              </div>
            </div>
          </div>

          {/* 顧客情報 */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>{event.customerName}</span>
            </div>
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a
                href={`mailto:${event.customerEmail}`}
                className="text-primary hover:underline"
              >
                {event.customerEmail}
              </a>
            </div>
            {event.customerPhone && (
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a
                  href={`tel:${event.customerPhone}`}
                  className="text-primary hover:underline"
                >
                  {event.customerPhone}
                </a>
              </div>
            )}
          </div>

          {/* メモ */}
          {event.notes && (
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{event.notes}</p>
            </div>
          )}

          {/* ステータス変更 */}
          <div className="border-t pt-4">
            <label className="mb-2 block text-sm font-medium">
              ステータス変更
            </label>
            <Select
              value={event.status}
              onValueChange={(value) =>
                handleStatusChange(value as ReservationStatus)
              }
              disabled={isPending}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">保留中</SelectItem>
                <SelectItem value="CONFIRMED">確認済み</SelectItem>
                <SelectItem value="CANCELLED">キャンセル</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 詳細ページリンク */}
          <div className="flex justify-end border-t pt-4">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/reservations/${event.id}`}>
                詳細を見る
                <ExternalLink className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
