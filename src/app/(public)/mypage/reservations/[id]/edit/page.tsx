/**
 * /mypage/reservations/[id]/edit — 予約変更ページ
 *
 * 変更期限内かつ割引なしの PENDING/CONFIRMED 予約のみ編集可能。
 * 期限切れ・割引あり・ステータス不可の場合は詳細ページにリダイレクト。
 */

import type { ReactElement } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { verifyCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { requireFeatureEnabled } from "@/shared/lib/features/check";
import { getCustomerReservationDetail } from "@/shared/domain/reservations/customer-queries";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { reservationDeadlineNow } from "@/shared/domain/reservations/server-deadline-instant";
import { isReservationEditableForCustomerSelfServe } from "@/shared/domain/reservations/edit-eligibility";
import { getActiveSpacesByLocationId } from "@/shared/domain/spaces/public-queries";
import { getTurnstileSiteKey } from "@/shared/data/turnstile";
import { Heading } from "@/public/components/design-system/heading";
import { EditReservationForm } from "@/app/(public)/_shared/components/edit-reservation-form";
import { updateReservationAction } from "../../../_shared/actions/reservation";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function ReservationEditPage({
  params,
}: PageProps): Promise<ReactElement> {
  await connection();

  // FEAT-3PLANE-02: mypage sub-page も公開 /reservation と対称に reservation
  // feature OFF 時に 404 (fail-closed)。gate 無しだと会員は「予約変更」画面を
  // 使えてしまい、reservation module の可視性契約が破れる。
  await requireFeatureEnabled("reservation");

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

  const now = reservationDeadlineNow();
  const eligibility = isReservationEditableForCustomerSelfServe({
    status: reservation.status,
    paymentStatus: reservation.paymentStatus,
    discountAmounts: {
      couponDiscountAmount: reservation.couponDiscountAmount,
      durationDiscountAmount: reservation.durationDiscountAmount,
      spaceDiscountAmount: reservation.spaceDiscountAmount,
    },
    startTime: reservation.startTime,
    modificationDeadlineHours: deadlineSettings.modificationDeadlineHours,
    now,
  });

  if (!eligibility.ok) {
    redirect(`/mypage/reservations/${id}?reason=${eligibility.reason}`);
  }

  // 同じロケーションのスペース一覧を取得
  const [spaces, turnstileSiteKey] = await Promise.all([
    getActiveSpacesByLocationId(reservation.space.locationId),
    getTurnstileSiteKey(),
  ]);

  // タイムゾーンを明示して JST で日付・時刻文字列を生成（Cloud Run は UTC）
  const TZ = "Asia/Tokyo";
  const startDate = reservation.startTime;
  const endDate = reservation.endTime;

  const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const dateStr = dateFormatter.format(startDate);
  const startTimeStr = timeFormatter.format(startDate);
  const endTimeStr = timeFormatter.format(endDate);

  return (
    <div className="mx-auto max-w-2xl">
      <Heading level={1}>予約内容の変更</Heading>

      <EditReservationForm
        key={reservation.id}
        reservationId={reservation.id}
        numberOfGuests={1}
        spaces={spaces}
        version={reservation.version}
        initialValues={{
          spaceId: reservation.spaceId,
          date: dateStr,
          startTime: startTimeStr,
          endTime: endTimeStr,
        }}
        turnstileSiteKey={turnstileSiteKey}
        action={updateReservationAction}
        cancelHref={`/mypage/reservations/${reservation.id}`}
        successHref={`/mypage/reservations/${reservation.id}`}
        turnstileAction={TURNSTILE_ACTIONS.mypage_reservation_edit}
      />
    </div>
  );
}
