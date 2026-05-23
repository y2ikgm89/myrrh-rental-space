"use client";

import Link from "next/link";
import { Badge } from "@/public/components/design-system/badge";
import { Heading } from "@/public/components/design-system/heading";
import type { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";
import {
  getValidPaymentStatus,
  PAYMENT_STATUS_LABELS,
  RESERVATION_STATUS_LABELS,
  RESERVATION_STATUS_ICONS,
} from "@/shared/lib/validations/enums/helpers";
import { isValidReservationStatus } from "@/shared/lib/validations/enums/guards";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import { formatSerializedDate } from "@/shared/lib/serialize";
import { useFormatPrice } from "@/public/hooks/use-format-price";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Reservation {
  readonly id: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly status: string;
  readonly totalPrice: number | null;
  readonly paymentStatus: string;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly space: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
}

interface ReservationCardProps {
  readonly reservation: Reservation;
  readonly canModify: boolean;
  readonly canCancel: boolean;
  readonly showPastDeadlineMessage: boolean;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type BadgeVariant = "default" | "success" | "warning" | "info";

const RESERVATION_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  PENDING: "warning",
  CONFIRMED: "success",
  COMPLETED: "info",
  CANCELLED: "default",
  NO_SHOW: "default",
};

const PAYMENT_BADGE_VARIANTS: Record<PaymentStatus, BadgeVariant> = {
  UNPAID: "warning",
  PENDING: "warning",
  PAID: "success",
  REFUNDED: "info",
  FAILED: "default",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReservationCard({
  reservation,
  canModify,
  canCancel,
  showPastDeadlineMessage,
}: ReservationCardProps) {
  const { formatTotal } = useFormatPrice();
  const { space, totalPrice, startTime, endTime, id } = reservation;
  const statusLabel = isValidReservationStatus(reservation.status)
    ? RESERVATION_STATUS_LABELS[reservation.status]
    : reservation.status;
  const paymentStatusEnum = getValidPaymentStatus(reservation.paymentStatus);

  return (
    <div className="border border-border p-4 sm:p-6 transition-colors">
      {/* Header: space name + status */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <Heading level={3}>{space.name}</Heading>
        <Badge
          variant={RESERVATION_BADGE_VARIANTS[reservation.status] ?? "default"}
        >
          {isValidReservationStatus(reservation.status) ? (
            <CuratedIcon
              name={RESERVATION_STATUS_ICONS[reservation.status]}
              className="mr-1 inline h-3 w-3"
            />
          ) : null}
          {statusLabel}
        </Badge>
      </div>

      {/* Date/time + price + actions */}
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>
          {formatSerializedDate(startTime, {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          〜{" "}
          {formatSerializedDate(endTime, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <p className="text-foreground font-medium">
              {formatTotal(totalPrice, "未定")}
            </p>
            {paymentStatusEnum !== "PAID" && (
              <Badge variant={PAYMENT_BADGE_VARIANTS[paymentStatusEnum]}>
                {PAYMENT_STATUS_LABELS[paymentStatusEnum]}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {canCancel && (
              <Link
                href={`/mypage/reservations/${id}`}
                className="inline-flex min-h-11 items-center whitespace-nowrap px-1 text-sm text-destructive hover:text-destructive/80 transition-colors"
              >
                キャンセル
              </Link>
            )}

            {canModify && (
              <Link
                href={`/mypage/reservations/${id}/edit`}
                className="inline-flex min-h-11 items-center whitespace-nowrap px-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                変更
              </Link>
            )}

            <Link
              href={`/mypage/reservations/${id}`}
              className="inline-flex min-h-11 items-center whitespace-nowrap px-1 text-sm font-medium text-foreground underline underline-offset-4 hover:text-accent transition-colors"
            >
              詳細を見る
            </Link>
          </div>
        </div>

        {showPastDeadlineMessage && (
          <p className="text-xs text-muted-foreground">
            変更・キャンセルはお電話でお問い合わせください
          </p>
        )}
      </div>
    </div>
  );
}
