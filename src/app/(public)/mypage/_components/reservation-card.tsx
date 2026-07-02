"use client";

import Link from "next/link";
import { Badge } from "@/public/components/design-system/badge";
import { Heading } from "@/public/components/design-system/heading";
import {
  RESERVATION_BADGE_VARIANTS,
  PAYMENT_BADGE_VARIANTS,
} from "./reservation-badge-variants";
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
  const paymentStatusLabel = PAYMENT_STATUS_LABELS[paymentStatusEnum];
  const startLabel = formatSerializedDate(startTime, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const reservationLabel = `${space.name}の予約: ${statusLabel}, 支払い: ${paymentStatusLabel}, ${startLabel}`;

  return (
    <article
      aria-label={reservationLabel}
      className="border border-border p-4 sm:p-6 transition-colors"
    >
      {/* Header: space name + status */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* min-w-0 break-words で長 space.name の overflow を防止し
            Badge の shrink-0 と組合せて header の wrap を安定させる。 */}
        <Heading level={3} className="min-w-0 break-words">
          {space.name}
        </Heading>
        <Badge
          variant={RESERVATION_BADGE_VARIANTS[reservation.status] ?? "default"}
          className="shrink-0"
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
      <div className="flex flex-col gap-3 text-sm text-muted-foreground">
        {/* 日時は 〜 の前後で語間 break を制御し、mobile 改行時も
            「YYYY年M月D日 HH:MM」「HH:MM」のまとまりを保つ。 */}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="whitespace-nowrap">
            {formatSerializedDate(startTime, {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span aria-hidden="true">〜</span>
          <span className="whitespace-nowrap">
            {formatSerializedDate(endTime, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </p>
        {/* mobile: 価格行とアクション行を縦に分離。sm+ で横並びに戻す。 */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">
              {formatTotal(totalPrice, "未定")}
            </p>
            {paymentStatusEnum !== "PAID" && (
              <Badge variant={PAYMENT_BADGE_VARIANTS[paymentStatusEnum]}>
                {PAYMENT_STATUS_LABELS[paymentStatusEnum]}
              </Badge>
            )}
          </div>

          {/* アクション群: mobile は w-full sm:w-auto で full-width タップ標的、
              sm+ で intrinsic に戻す。px-3 で WCAG 2.5.8 Target Spacing を担保。 */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
            {canCancel && (
              <Link
                href={`/mypage/reservations/${id}`}
                aria-label={`${reservationLabel} をキャンセルする`}
                className="inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap px-3 text-sm text-destructive transition-colors hover:text-destructive/80 sm:w-auto sm:justify-start"
              >
                キャンセル
              </Link>
            )}

            {canModify && (
              <Link
                href={`/mypage/reservations/${id}/edit`}
                aria-label={`${reservationLabel} を変更する`}
                className="inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap px-3 text-sm text-muted-foreground transition-colors hover:text-foreground sm:w-auto sm:justify-start"
              >
                変更
              </Link>
            )}

            <Link
              href={`/mypage/reservations/${id}`}
              aria-label={`${reservationLabel} の詳細を見る`}
              className="inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap px-3 text-sm font-medium text-foreground underline underline-offset-4 transition-colors hover:text-accent sm:w-auto sm:justify-start"
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
    </article>
  );
}
