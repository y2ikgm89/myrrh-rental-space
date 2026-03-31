/**
 * /mypage — 予約一覧ダッシュボード
 *
 * 顧客の予約一覧を表示。キャンセル・変更リンクは期限内のみ表示。
 */

import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { verifyCustomerSession } from "@/shared/lib/auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getCustomerReservations } from "@/shared/domain/reservations/customer-queries";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { buildReservationListItems } from "./_lib/build-reservation-list-items";
import { toPlainArray } from "@/shared/lib/serialize";
import Link from "next/link";
import { Heading } from "@/public/components/design-system/heading";
import { CUSTOMER_PLACEHOLDER_NAME } from "@/shared/domain/customers/link";
import { ReservationList } from "./_components/reservation-list";

export default async function MypagePage(): Promise<ReactElement> {
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

  const isNameIncomplete =
    customer.lastName === CUSTOMER_PLACEHOLDER_NAME ||
    customer.firstName === "";

  return (
    <div>
      <Heading level={1} className="mb-4 md:mb-8">
        予約一覧
      </Heading>
      {isNameIncomplete && (
        <div className="mb-6 rounded-lg border border-accent/30 bg-accent/5 p-4 text-sm text-foreground">
          お名前が未登録です。
          <Link href="/mypage/settings" className="ml-1 underline text-primary">
            アカウント設定
          </Link>
          から姓名を入力してください。
        </div>
      )}
      <ReservationList items={reservationListItems} />
    </div>
  );
}
