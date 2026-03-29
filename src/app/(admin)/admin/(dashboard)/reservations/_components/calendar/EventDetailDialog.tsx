"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import {
  IconClock,
  IconMapPin,
  IconUser,
  IconMail,
  IconPhone,
  IconFileText,
  IconExternalLink,
} from "@tabler/icons-react";
import { formatPrice } from "@/shared/lib/pricing/format";
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
} from "@/admin/components/ui";
import { ReservationStatusBadge } from "@/admin/components/status-badges";
import type { CalendarEvent } from "@/admin/lib/calendar";
import { ReservationStatus } from "@/shared/db/enums";
import { isValidReservationStatus } from "@/shared/lib/validations/enums/guards";
import {
  TERMINAL_RESERVATION_STATUSES,
  RESERVATION_STATUS_TRANSITIONS,
} from "@/shared/lib/validations/enums/helpers";

const STATUS_LABELS: Record<ReservationStatus, string> = {
  [ReservationStatus.PENDING]: "保留中",
  [ReservationStatus.CONFIRMED]: "確認済み",
  [ReservationStatus.COMPLETED]: "完了",
  [ReservationStatus.CANCELLED]: "キャンセル",
  [ReservationStatus.NO_SHOW]: "無断キャンセル",
};

interface EventDetailDialogProps {
  event: CalendarEvent | null;
  isPending: boolean;
  onClose: () => void;
  onStatusChange: (eventId: string, status: ReservationStatus) => void;
}

export function EventDetailDialog({
  event,
  isPending,
  onClose,
  onStatusChange,
}: EventDetailDialogProps) {
  const handleStatusChange = (status: ReservationStatus) => {
    if (!event) return;
    onStatusChange(event.id, status);
  };

  return (
    <Dialog open={!!event} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{event?.title}</span>
            {event && <ReservationStatusBadge status={event.status} />}
          </DialogTitle>
        </DialogHeader>

        {event && (
          <div className="space-y-4">
            {/* 日時 */}
            <div className="flex items-start gap-3">
              <IconClock className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">
                  {/* eslint-disable-next-line @eslint-react/purity -- Client Component: new Date() is safe here */}
                  {format(new Date(event.startTime), "yyyy年M月d日 (E)", {
                    locale: ja,
                  })}
                </div>
                <div className="text-sm text-muted-foreground">
                  {/* eslint-disable-next-line @eslint-react/purity -- Client Component: new Date() is safe here */}
                  {format(new Date(event.startTime), "HH:mm")} -{" "}
                  {/* eslint-disable-next-line @eslint-react/purity -- Client Component: new Date() is safe here */}
                  {format(new Date(event.endTime), "HH:mm")}
                </div>
              </div>
            </div>

            {/* スペース */}
            <div className="flex items-start gap-3">
              <IconMapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">{event.spaceName}</div>
                <div className="text-sm text-muted-foreground">
                  {formatPrice(event.totalPrice, "-")}
                </div>
              </div>
            </div>

            {/* 顧客情報 */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <IconUser className="h-4 w-4 text-muted-foreground" />
                <span>{event.customerName}</span>
              </div>
              <div className="flex items-center gap-3">
                <IconMail className="h-4 w-4 text-muted-foreground" />
                <a
                  href={`mailto:${event.customerEmail}`}
                  className="text-primary hover:underline"
                >
                  {event.customerEmail}
                </a>
              </div>
              {event.customerPhone && (
                <div className="flex items-center gap-3">
                  <IconPhone className="h-4 w-4 text-muted-foreground" />
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
                <IconFileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
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
                onValueChange={(value) => {
                  if (isValidReservationStatus(value))
                    handleStatusChange(value);
                }}
                disabled={
                  isPending ||
                  TERMINAL_RESERVATION_STATUSES.includes(event.status)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={event.status}>
                    {STATUS_LABELS[event.status]}
                  </SelectItem>
                  {(RESERVATION_STATUS_TRANSITIONS[event.status] ?? []).map(
                    (status) => (
                      <SelectItem key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* 詳細ページリンク */}
            <div className="flex justify-end border-t pt-4">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/admin/reservations/${event.id}`}>
                  詳細を見る
                  <IconExternalLink className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
