"use client";

import Link from "next/link";
import {
  formatDateWithWeekday,
  formatTimeShort,
} from "@/shared/lib/date-format";
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
  DialogDescription,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { ReservationStatusBadge } from "@/admin/components/status-badges";
import type { CalendarEvent } from "@/admin/lib/calendar";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { isValidReservationStatus } from "@/shared/lib/validations/enums/guards";
import {
  TERMINAL_RESERVATION_STATUSES,
  RESERVATION_STATUS_TRANSITIONS,
  RESERVATION_STATUS_LABELS,
} from "@/shared/lib/validations/enums/helpers";

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
          <DialogDescription className="sr-only">
            予約の詳細情報を確認し、ステータスを変更できます
          </DialogDescription>
        </DialogHeader>

        {event && (
          <div className="space-y-4">
            {/* 日時 */}
            <div className="flex items-start gap-3">
              <IconClock className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">
                  {formatDateWithWeekday(event.startTime)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatTimeShort(event.startTime)} -{" "}
                  {formatTimeShort(event.endTime)}
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
                    {RESERVATION_STATUS_LABELS[event.status]}
                  </SelectItem>
                  {(RESERVATION_STATUS_TRANSITIONS[event.status] ?? []).map(
                    (status) => (
                      <SelectItem key={status} value={status}>
                        {RESERVATION_STATUS_LABELS[status]}
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
