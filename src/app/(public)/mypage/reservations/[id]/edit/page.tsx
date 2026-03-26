/**
 * /mypage/reservations/[id]/edit — 予約変更ページ
 *
 * 変更期限内かつ割引なしの PENDING/CONFIRMED 予約のみ編集可能。
 * 期限切れ・割引あり・ステータス不可の場合は詳細ページにリダイレクト。
 */

import type { ReactElement } from "react";
import { notFound, redirect } from "next/navigation";
import { verifyCustomerSession } from "@/shared/lib/auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getCustomerReservationDetail } from "@/shared/domain/reservations/customer-queries";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { isWithinDeadline } from "@/shared/domain/reservations/deadline";
import { reservationDeadlineNow } from "@/shared/domain/reservations/server-deadline-instant";
import { getActiveSpacesByLocationId } from "@/shared/domain/spaces/public-queries";
import { Heading } from "@/public/components/design-system/heading";
import { EditReservationForm } from "./_components/edit-reservation-form";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EDITABLE_STATUSES = new Set(["PENDING", "CONFIRMED"]);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function ReservationEditPage({
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

  // ステータスチェック
  if (!EDITABLE_STATUSES.has(reservation.status)) {
    redirect(`/mypage/reservations/${id}`);
  }

  // 変更期限チェック
  if (
    !isWithinDeadline(
      reservation.startTime,
      deadlineSettings.modificationDeadlineHours,
      reservationDeadlineNow(),
    )
  ) {
    redirect(`/mypage/reservations/${id}`);
  }

  // 手動割引チェック
  const hasManualDiscount =
    (reservation.couponDiscountAmount != null &&
      Number(reservation.couponDiscountAmount) > 0) ||
    (reservation.durationDiscountAmount != null &&
      Number(reservation.durationDiscountAmount) > 0) ||
    (reservation.spaceDiscountAmount != null &&
      Number(reservation.spaceDiscountAmount) > 0);

  if (hasManualDiscount) {
    redirect(`/mypage/reservations/${id}`);
  }

  // 同じロケーションのスペース一覧を取得
  const spaces = await getActiveSpacesByLocationId(
    reservation.space.locationId,
  );

  const startDate = reservation.startTime;
  const endDate = reservation.endTime;
  const dateStr = `${String(startDate.getFullYear())}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;
  const startTimeStr = `${String(startDate.getHours()).padStart(2, "0")}:${String(startDate.getMinutes()).padStart(2, "0")}`;
  const endTimeStr = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;

  return (
    <div className="max-w-2xl">
      <Heading level={1} className="mb-8">
        予約内容の変更
      </Heading>

      <EditReservationForm
        reservationId={reservation.id}
        numberOfGuests={1}
        spaces={spaces}
        initialValues={{
          spaceId: reservation.spaceId,
          date: dateStr,
          startTime: startTimeStr,
          endTime: endTimeStr,
        }}
      />
    </div>
  );
}
