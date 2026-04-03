"use client";

import Link from "next/link";
import { Badge } from "@/public/components/design-system/badge";
import { Heading } from "@/public/components/design-system/heading";
import type { PaymentStatus } from "@generated/prisma/enums";
import {
  getValidPaymentStatus,
  PAYMENT_STATUS_LABELS,
} from "@/shared/lib/validations/enums/helpers";
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

const STATUS_LABELS: Record<string, string> = {
  PENDING: "保留",
  CONFIRMED: "確定",
  COMPLETED: "完了",
  CANCELLED: "キャンセル済み",
  NO_SHOW: "無断キャンセル",
};

type BadgeVariant = "default" | "success" | "warning" | "info";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  PENDING: "warning",
  CONFIRMED: "success",
  COMPLETED: "info",
  CANCELLED: "default",
  NO_SHOW: "default",
};

function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function getStatusVariant(status: string): BadgeVariant {
  return STATUS_VARIANTS[status] ?? "default";
}

const PAYMENT_BADGE_VARIANTS: Record<PaymentStatus, BadgeVariant> = {
  UNPAID: "warning",
  PENDING: "warning",
  PAID: "success",
  REFUNDED: "info",
  FAILED: "default",
};

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

function formatDateTime(date: string): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}年${month}月${day}日 ${hours}:${minutes}`;
}

function formatTimeOnly(date: string): string {
  const d = new Date(date);
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

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
  const { status, space, totalPrice, startTime, endTime, id } = reservation;
  const paymentStatusEnum = getValidPaymentStatus(reservation.paymentStatus);

  return (
    <div className="border border-border p-4 sm:p-6 transition-colors">
      {/* Header: space name + status */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <Heading level={3} className="!text-lg">
          {space.name}
        </Heading>
        <Badge variant={getStatusVariant(status)}>
          {getStatusLabel(status)}
        </Badge>
      </div>

      {/* Date/time + price */}
      <div className="flex flex-col gap-2 text-sm text-muted-foreground mb-4">
        <p>
          {formatDateTime(startTime)} 〜 {formatTimeOnly(endTime)}
        </p>
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
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-4 border-t border-border">
        <Link
          href={`/mypage/reservations/${id}`}
          className="inline-block rounded-md px-3 py-1.5 text-sm text-accent hover:bg-accent/5 transition-colors"
        >
          詳細を見る
        </Link>

        {canModify && (
          <Link
            href={`/mypage/reservations/${id}/edit`}
            className="inline-block rounded-md px-3 py-1.5 text-sm text-accent hover:bg-accent/5 transition-colors"
          >
            変更
          </Link>
        )}

        {canCancel && (
          <Link
            href={`/mypage/reservations/${id}`}
            className="inline-block rounded-md px-3 py-1.5 text-sm text-destructive hover:bg-destructive/5 transition-colors"
          >
            キャンセル
          </Link>
        )}

        {showPastDeadlineMessage && (
          <p className="text-xs text-muted-foreground">
            変更・キャンセルはお電話でお問い合わせください
          </p>
        )}
      </div>
    </div>
  );
}
