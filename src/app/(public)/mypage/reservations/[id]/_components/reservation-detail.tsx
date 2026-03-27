import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/public/components/design-system/badge";
import { Heading } from "@/public/components/design-system/heading";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Space {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly locationId: string;
  readonly capacity: number;
}

interface ReservationDetailData {
  readonly id: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly status: string;
  readonly totalPrice: number | null;
  readonly basePrice: number | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly couponId: string | null;
  readonly couponDiscountAmount: number | null;
  readonly durationDiscountAmount: number | null;
  readonly spaceDiscountAmount: number | null;
  readonly spaceId: string;
  readonly space: Space;
}

interface ReservationDetailProps {
  readonly reservation: ReservationDetailData;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  PENDING: "保留中",
  CONFIRMED: "確定",
  COMPLETED: "完了",
  CANCELLED: "キャンセル済み",
  NO_SHOW: "不参加",
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

function formatDate(date: string): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"] as const;
  const weekday = weekdays[d.getDay()];
  return `${year}年${month}月${day}日（${weekday ?? ""}）`;
}

function formatTime(date: string): string {
  const d = new Date(date);
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatCreatedAt(date: string): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${year}年${month}月${day}日`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DetailRowProps {
  readonly label: string;
  readonly children: ReactNode;
}

function DetailRow({ label, children }: DetailRowProps) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4 py-3 border-b border-border last:border-none">
      <dt className="text-sm text-muted-foreground sm:w-36 shrink-0">
        {label}
      </dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function ReservationDetail({ reservation }: ReservationDetailProps) {
  const {
    status,
    space,
    startTime,
    endTime,
    totalPrice,
    basePrice,
    couponDiscountAmount,
    durationDiscountAmount,
    notes,
    createdAt,
  } = reservation;

  const couponDiscount = couponDiscountAmount ?? 0;
  const durationDiscount = durationDiscountAmount ?? 0;
  const hasDiscount = couponDiscount > 0 || durationDiscount > 0;

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <Heading level={2} className="!text-xl">
          {space.name}
        </Heading>
        <Badge variant={getStatusVariant(status)}>
          {getStatusLabel(status)}
        </Badge>
      </div>

      {/* Detail rows */}
      <dl className="px-6">
        <DetailRow label="利用日">{formatDate(startTime)}</DetailRow>

        <DetailRow label="利用時間">
          {formatTime(startTime)} 〜 {formatTime(endTime)}
        </DetailRow>

        {hasDiscount && basePrice != null && (
          <DetailRow label="基本料金">¥{basePrice.toLocaleString()}</DetailRow>
        )}

        {couponDiscount > 0 && (
          <DetailRow label="クーポン割引">
            <span className="text-success">
              −¥{couponDiscount.toLocaleString()}
            </span>
          </DetailRow>
        )}

        {durationDiscount > 0 && (
          <DetailRow label="長時間割引">
            <span className="text-success">
              −¥{durationDiscount.toLocaleString()}
            </span>
          </DetailRow>
        )}

        <DetailRow label="合計金額">
          <span className="text-base font-medium">
            {totalPrice != null ? `¥${totalPrice.toLocaleString()}` : "未定"}
          </span>
        </DetailRow>

        {notes != null && notes.length > 0 && (
          <DetailRow label="備考">
            <span className="whitespace-pre-wrap">{notes}</span>
          </DetailRow>
        )}

        <DetailRow label="予約日">{formatCreatedAt(createdAt)}</DetailRow>
      </dl>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border">
        <Link href="/mypage" className="text-sm text-primary hover:underline">
          ← 予約一覧に戻る
        </Link>
      </div>
    </div>
  );
}
