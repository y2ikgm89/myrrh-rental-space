"use client";

import Link from "next/link";
import { Badge } from "@/public/components/design-system/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Reservation {
  readonly id: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly status: string;
  readonly totalPrice: number | null;
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
  const { status, space, totalPrice, startTime, endTime, id } = reservation;

  return (
    <div className="rounded-lg border border-border bg-card p-6 transition-shadow hover:shadow-lg">
      {/* Header: space name + status */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading text-lg font-semibold tracking-[var(--tracking-tight)]">
          {space.name}
        </h3>
        <Badge variant={getStatusVariant(status)}>
          {getStatusLabel(status)}
        </Badge>
      </div>

      {/* Date/time + price */}
      <div className="flex flex-col gap-2 text-sm text-muted-foreground mb-4">
        <p>
          {formatDateTime(startTime)} 〜 {formatTimeOnly(endTime)}
        </p>
        <p className="text-foreground font-medium">
          {totalPrice != null ? `¥${totalPrice.toLocaleString()}` : "未定"}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t border-border">
        <Link
          href={`/mypage/reservations/${id}`}
          className="text-sm text-primary hover:underline"
        >
          詳細を見る
        </Link>

        {canModify && (
          <Link
            href={`/mypage/reservations/${id}/edit`}
            className="text-sm text-primary hover:underline"
          >
            変更
          </Link>
        )}

        {canCancel && (
          <Link
            href={`/mypage/reservations/${id}/cancel`}
            className="text-sm text-primary hover:underline"
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
