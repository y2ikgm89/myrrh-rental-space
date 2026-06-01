import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/public/components/design-system/badge";
import { Heading } from "@/public/components/design-system/heading";
import { formatPrice } from "@/shared/lib/pricing/format";
import {
  RESERVATION_BADGE_VARIANTS,
  PAYMENT_BADGE_VARIANTS,
} from "../../../_components/reservation-badge-variants";
import {
  getValidPaymentStatus,
  PAYMENT_STATUS_LABELS,
  RESERVATION_STATUS_LABELS,
  RESERVATION_STATUS_ICONS,
  CANCELLED_BY,
} from "@/shared/lib/validations/enums/helpers";
import { isValidReservationStatus } from "@/shared/lib/validations/enums/guards";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import { formatSerializedDate } from "@/shared/lib/serialize";
import { getAppUrl } from "@/shared/lib/constants";
import { buildAddToCalendarUrls } from "@/shared/lib/ical/urls";
import { AddToCalendar } from "@/app/(public)/_shared/components/ui/add-to-calendar";

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
  readonly paymentStatus: string;
  readonly paidAt: string | null;
  readonly taxRateType: string | null;
  readonly taxRate: number | null;
  readonly taxAmount: number | null;
  readonly totalPriceWithTax: number | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly couponId: string | null;
  readonly couponDiscountAmount: number | null;
  readonly durationDiscountAmount: number | null;
  readonly spaceDiscountAmount: number | null;
  readonly cancellationReason: string | null;
  readonly cancelledAt: string | null;
  readonly cancelledByType: string | null;
  readonly spaceId: string;
  readonly space: Space;
}

interface DeadlineSettings {
  readonly cancellationDeadlineHours: number;
  readonly modificationDeadlineHours: number;
}

interface ReservationDetailProps {
  readonly reservation: ReservationDetailData;
  readonly deadlineSettings: DeadlineSettings | undefined;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const TAX_RATE_LABELS: Record<string, string> = {
  standard: "標準税率",
  reduced: "軽減税率",
};

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

export function ReservationDetail({
  reservation,
  deadlineSettings,
}: ReservationDetailProps) {
  const {
    id,
    status,
    space,
    startTime,
    endTime,
    totalPrice,
    basePrice,
    taxRateType,
    taxRate,
    taxAmount,
    totalPriceWithTax,
    couponDiscountAmount,
    durationDiscountAmount,
    cancellationReason,
    cancelledAt,
    cancelledByType,
    notes,
    createdAt,
  } = reservation;

  const couponDiscount = couponDiscountAmount ?? 0;
  const durationDiscount = durationDiscountAmount ?? 0;
  const hasDiscount = couponDiscount > 0 || durationDiscount > 0;
  const hasTax = taxAmount != null && taxAmount > 0;
  const statusLabel = isValidReservationStatus(reservation.status)
    ? RESERVATION_STATUS_LABELS[reservation.status]
    : reservation.status;
  const paymentStatusEnum = getValidPaymentStatus(reservation.paymentStatus);
  const isActive = status === "PENDING" || status === "CONFIRMED";

  return (
    <div className="border border-border">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-4 sm:p-6 border-b border-border">
        <Heading level={2} className="!text-xl">
          {space.name}
        </Heading>
        <div className="flex items-center gap-2">
          <Badge variant={RESERVATION_BADGE_VARIANTS[status] ?? "default"}>
            {isValidReservationStatus(reservation.status) ? (
              <CuratedIcon
                name={RESERVATION_STATUS_ICONS[reservation.status]}
                className="mr-1 inline h-3 w-3"
              />
            ) : null}
            {statusLabel}
          </Badge>
          <Badge variant={PAYMENT_BADGE_VARIANTS[paymentStatusEnum]}>
            {PAYMENT_STATUS_LABELS[paymentStatusEnum]}
          </Badge>
        </div>
      </div>

      {/* Detail rows */}
      <dl className="px-4 sm:px-6">
        <DetailRow label="利用日">
          {formatSerializedDate(startTime, {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "short",
          })}
        </DetailRow>

        <DetailRow label="利用時間">
          {formatSerializedDate(startTime, {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          〜{" "}
          {formatSerializedDate(endTime, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </DetailRow>

        {hasDiscount && basePrice != null && (
          <DetailRow label="基本料金">{formatPrice(basePrice)}</DetailRow>
        )}

        {couponDiscount > 0 && (
          <DetailRow label="クーポン割引">
            <span className="text-success">−{formatPrice(couponDiscount)}</span>
          </DetailRow>
        )}

        {durationDiscount > 0 && (
          <DetailRow label="長時間割引">
            <span className="text-success">
              −{formatPrice(durationDiscount)}
            </span>
          </DetailRow>
        )}

        <DetailRow label="合計金額">
          <span className="text-base font-medium">
            {formatPrice(totalPrice, "未定")}
          </span>
        </DetailRow>

        {hasTax && (
          <>
            <DetailRow
              label={`消費税${taxRateType ? `(${TAX_RATE_LABELS[taxRateType] ?? taxRateType}${taxRate != null ? ` ${taxRate}%` : ""})` : ""}`}
            >
              {formatPrice(taxAmount)}
            </DetailRow>
            {totalPriceWithTax != null && (
              <DetailRow label="税込合計">
                <span className="text-base font-medium">
                  {formatPrice(totalPriceWithTax)}
                </span>
              </DetailRow>
            )}
          </>
        )}

        {notes != null && notes.length > 0 && (
          <DetailRow label="備考">
            <span className="whitespace-pre-wrap">{notes}</span>
          </DetailRow>
        )}

        <DetailRow label="予約日">{formatSerializedDate(createdAt)}</DetailRow>

        {status === "CANCELLED" && cancelledAt && (
          <DetailRow label="キャンセル日">
            {formatSerializedDate(cancelledAt)}
            {cancelledByType === CANCELLED_BY.CUSTOMER && (
              <span className="ml-2 text-xs text-muted-foreground">
                （お客様によるキャンセル）
              </span>
            )}
          </DetailRow>
        )}

        {status === "CANCELLED" && cancellationReason && (
          <DetailRow label="キャンセル理由">
            <span className="whitespace-pre-wrap">{cancellationReason}</span>
          </DetailRow>
        )}
      </dl>

      {/* Policy info (active reservations only) */}
      {isActive && deadlineSettings != null && (
        <div className="px-4 sm:px-6 py-4 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            ご利用案内
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>
              ・変更期限: ご利用日の
              {deadlineSettings.modificationDeadlineHours}時間前まで
            </li>
            <li>
              ・キャンセル期限: ご利用日の
              {deadlineSettings.cancellationDeadlineHours}時間前まで
            </li>
          </ul>
        </div>
      )}

      {/* Add to Calendar (active reservations only) */}
      {status !== "CANCELLED" && (
        <div className="px-4 sm:px-6 py-4 border-t border-border">
          <AddToCalendar
            urls={buildAddToCalendarUrls({
              summary: `【予約】${space.name}`,
              description: [
                `予約ID: ${id.slice(0, 8).toUpperCase()}`,
                `スペース: ${space.name}`,
                ...(notes != null && notes.length > 0
                  ? [`備考: ${notes}`]
                  : []),
              ].join("\n"),
              startTime: new Date(startTime),
              endTime: new Date(endTime),
              icsDownloadUrl: `${getAppUrl()}/api/calendar/reservation/${id}`,
            })}
          />
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-4 border-t border-border">
        <Link
          href="/mypage"
          className="inline-flex min-h-11 items-center text-sm text-foreground underline underline-offset-4 hover:text-accent transition-colors"
        >
          予約一覧に戻る
        </Link>
        <Link
          href={`/contact?subject=${encodeURIComponent(`予約 #${id.slice(0, 8)} について`)}`}
          className="inline-flex min-h-11 items-center text-sm text-foreground underline underline-offset-4 hover:text-accent transition-colors"
        >
          この予約について問い合わせる
        </Link>
      </div>
    </div>
  );
}
