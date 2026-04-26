/**
 * /mypage — 予約一覧ダッシュボード
 *
 * 顧客の予約一覧を表示。キャンセル・変更リンクは期限内のみ表示。
 */

import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import type { SearchParams } from "nuqs/server";
import { verifyCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getCustomerReservations } from "@/shared/domain/reservations/customer-queries";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { buildReservationListItems } from "./_lib/build-reservation-list-items";
import { toPlainArray } from "@/shared/lib/serialize";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import { ReservationTabs } from "./_components/reservation-tabs";

const ACTIVE_STATUS_SET = new Set<string>(ACTIVE_RESERVATION_STATUSES);

interface MypagePageProps {
  readonly searchParams: Promise<SearchParams>;
}

export default async function MypagePage({
  searchParams,
}: MypagePageProps): Promise<ReactElement> {
  const sp = await searchParams;
  const justCancelled = sp["cancelled"] === "ok";

  const { user } = await verifyCustomerSession();
  const customer = await getCustomerByUserId(user.id);

  if (!customer) {
    redirect("/login");
  }

  const [reservations, deadlineSettings] = await Promise.all([
    getCustomerReservations(customer.id),
    getReservationDeadlineSettings(),
  ]);

  const rawItems = buildReservationListItems(reservations, deadlineSettings);
  const reservationListItems = toPlainArray(
    rawItems.map((item) => ({
      ...item,
      reservation: {
        ...item.reservation,
        startTime: item.reservation.startTime.toISOString(),
        endTime: item.reservation.endTime.toISOString(),
        createdAt: item.reservation.createdAt.toISOString(),
      },
    })),
  );

  const activeItems = reservationListItems.filter((item) =>
    ACTIVE_STATUS_SET.has(item.reservation.status),
  );
  const pastItems = reservationListItems.filter(
    (item) => !ACTIVE_STATUS_SET.has(item.reservation.status),
  );

  return (
    <Stack gap="lg">
      <Heading level={1}>予約一覧</Heading>
      {justCancelled && (
        <div
          role="status"
          aria-live="polite"
          className="border border-success/30 bg-success/5 p-4 text-sm text-foreground"
        >
          <p className="font-medium">予約をキャンセルしました</p>
          <p className="mt-1 text-muted-foreground">
            キャンセル完了の確認メールをお送りしました。
          </p>
        </div>
      )}
      <ReservationTabs activeItems={activeItems} pastItems={pastItems} />
    </Stack>
  );
}
