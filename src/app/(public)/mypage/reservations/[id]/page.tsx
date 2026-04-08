/**
 * /mypage/reservations/[id] — 予約詳細ページ
 *
 * 顧客の予約詳細を表示。キャンセル期限内かつキャンセル可能ステータスの場合のみキャンセルボタンを表示。
 */

import type { ReactElement } from "react";
import { notFound, redirect } from "next/navigation";
import { verifyCustomerSession } from "@/shared/lib/auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getCustomerReservationDetail } from "@/shared/domain/reservations/customer-queries";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { isWithinDeadline } from "@/shared/domain/reservations/deadline";
import { reservationDeadlineNow } from "@/shared/domain/reservations/server-deadline-instant";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import { ReservationStatus } from "@generated/prisma/enums";
import { toPlainObject } from "@/shared/lib/serialize";
import { getReviewForReservation } from "@/shared/domain/reviews/public-queries";
import { Heading } from "@/public/components/design-system/heading";
import { Button } from "@/public/components/design-system/button";
import { Stack } from "@/public/components/design-system/stack";
import { Divider } from "@/public/components/design-system/divider";
import { getTurnstileSiteKey } from "@/public/data/turnstile";
import { ReservationDetail } from "./_components/reservation-detail";
import { CancelButton } from "./_components/cancel-button";
import { ReviewForm } from "./_components/review-form";
import { ReviewDisplay } from "./_components/review-display";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANCELLABLE_STATUSES = new Set(ACTIVE_RESERVATION_STATUSES);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function ReservationDetailPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { id } = await params;

  const { user } = await verifyCustomerSession();
  const customer = await getCustomerByUserId(user.id);

  if (!customer) {
    redirect("/login");
  }

  const [reservation, deadlineSettings] = await Promise.all([
    getCustomerReservationDetail(id, customer.id),
    getReservationDeadlineSettings(),
  ]);

  if (!reservation) {
    notFound();
  }

  const isCancellableStatus = CANCELLABLE_STATUSES.has(reservation.status);

  const now = reservationDeadlineNow();

  const canCancel =
    isCancellableStatus &&
    isWithinDeadline(
      reservation.startTime,
      deadlineSettings.cancellationDeadlineHours,
      now,
    );

  const hasManualDiscount =
    (reservation.couponDiscountAmount != null &&
      reservation.couponDiscountAmount > 0) ||
    (reservation.durationDiscountAmount != null &&
      reservation.durationDiscountAmount > 0) ||
    (reservation.spaceDiscountAmount != null &&
      reservation.spaceDiscountAmount > 0);

  const canEdit =
    isCancellableStatus &&
    !hasManualDiscount &&
    isWithinDeadline(
      reservation.startTime,
      deadlineSettings.modificationDeadlineHours,
      now,
    );

  const isCompleted = reservation.status === ReservationStatus.COMPLETED;

  const [existingReview, turnstileSiteKey] = await Promise.all([
    isCompleted
      ? getReviewForReservation(reservation.id, customer.id)
      : Promise.resolve(null),
    getTurnstileSiteKey(),
  ]);

  const serializedReservation = toPlainObject({
    ...reservation,
    startTime: reservation.startTime.toISOString(),
    endTime: reservation.endTime.toISOString(),
    createdAt: reservation.createdAt.toISOString(),
    paidAt: reservation.paidAt ? reservation.paidAt.toISOString() : null,
    cancelledAt: reservation.cancelledAt
      ? reservation.cancelledAt.toISOString()
      : null,
  });

  return (
    <Stack gap="lg" className="max-w-2xl">
      <Heading level={1} accent>
        予約詳細
      </Heading>

      <ReservationDetail
        reservation={serializedReservation}
        deadlineSettings={deadlineSettings}
      />

      {(canEdit || canCancel) && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          {canEdit && (
            <Button
              size="sm"
              href={`/mypage/reservations/${reservation.id}/edit`}
            >
              予約を変更する
            </Button>
          )}
          {canCancel && (
            <CancelButton
              reservationId={reservation.id}
              turnstileSiteKey={turnstileSiteKey}
            />
          )}
        </div>
      )}

      {isCompleted && existingReview ? (
        <>
          <Divider variant="subtle" />
          <ReviewDisplay
            review={{
              ...existingReview,
              createdAt: existingReview.createdAt.toISOString(),
            }}
          />
        </>
      ) : null}

      {isCompleted && !existingReview ? (
        <>
          <Divider variant="subtle" />
          <ReviewForm
            reservationId={reservation.id}
            spaceName={reservation.space.name}
            turnstileSiteKey={turnstileSiteKey}
          />
        </>
      ) : null}
    </Stack>
  );
}
