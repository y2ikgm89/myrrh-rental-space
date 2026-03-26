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

  const canCancel =
    CANCELLABLE_STATUSES.has(reservation.status) &&
    isWithinDeadline(
      new Date(reservation.startTime),
      deadlineSettings.cancellationDeadlineHours,
    );

  return (
    <div className="max-w-2xl">
      <Heading level={1} className="mb-8">
        予約詳細
      </Heading>

      <ReservationDetail reservation={reservation} />

      {canCancel && (
        <div className="mt-6">
          <CancelButton reservationId={reservation.id} />
        </div>
      )}
    </div>
  );
}
