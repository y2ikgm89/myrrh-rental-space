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
import { Heading } from "@/public/components/design-system/heading";
import { Button } from "@/public/components/design-system/button";
import { ReservationDetail } from "./_components/reservation-detail";
import { CancelButton } from "./_components/cancel-button";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANCELLABLE_STATUSES = new Set(["PENDING", "CONFIRMED"]);

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

  const canCancel =
    isCancellableStatus &&
    isWithinDeadline(
      new Date(reservation.startTime),
      deadlineSettings.cancellationDeadlineHours,
    );

  const hasManualDiscount =
    (reservation.couponDiscountAmount != null &&
      Number(reservation.couponDiscountAmount) > 0) ||
    (reservation.durationDiscountAmount != null &&
      Number(reservation.durationDiscountAmount) > 0) ||
    (reservation.spaceDiscountAmount != null &&
      Number(reservation.spaceDiscountAmount) > 0);

  const canEdit =
    isCancellableStatus &&
    !hasManualDiscount &&
    isWithinDeadline(
      new Date(reservation.startTime),
      deadlineSettings.modificationDeadlineHours,
    );

  return (
    <div className="max-w-2xl">
      <Heading level={1} className="mb-8">
        予約詳細
      </Heading>

      <ReservationDetail reservation={reservation} />

      {(canEdit || canCancel) && (
        <div className="mt-6 flex items-center gap-3">
          {canEdit && (
            <Button
              size="sm"
              href={`/mypage/reservations/${reservation.id}/edit`}
            >
              予約を変更する
            </Button>
          )}
          {canCancel && <CancelButton reservationId={reservation.id} />}
        </div>
      )}
    </div>
  );
}
