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
import { Heading } from "@/public/components/design-system/heading";
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

  return (
    <div>
      <Heading level={1} className="mb-8">
        予約一覧
      </Heading>
      <ReservationList
        reservations={reservations}
        deadlineSettings={deadlineSettings}
      />
    </div>
  );
}
