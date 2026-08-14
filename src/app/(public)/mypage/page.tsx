/**
 * /mypage — 予約一覧ダッシュボード
 *
 * 顧客の予約一覧を表示。キャンセル・変更リンクは期限内のみ表示。
 */

import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { SearchParams } from "nuqs/server";
import { requireMypageSession } from "@/shared/lib/customer-auth/gates";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getCustomerReservations } from "@/shared/domain/reservations/customer-queries";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { buildReservationListItems } from "./_lib/build-reservation-list-items";
import { toPlainArray } from "@/shared/lib/serialize";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import { ReservationTabs } from "./_components/reservation-tabs";
import { FlashMessage } from "./_components/flash-message";
import {
  isMergeSuccessQuery,
  MERGE_SUCCESS_MESSAGE,
} from "./_shared/merge-query";

const ACTIVE_STATUS_SET = new Set<string>(ACTIVE_RESERVATION_STATUSES);

interface MypagePageProps {
  readonly searchParams: Promise<SearchParams>;
}

export default async function MypagePage({
  searchParams,
}: MypagePageProps): Promise<ReactElement> {
  await connection();

  const sp = await searchParams;
  const cancelledParam = sp["cancelled"];
  const justCancelledSingle = cancelledParam === "ok";
  const justCancelledSeries = cancelledParam === "series";
  const justMerged = isMergeSuccessQuery(sp["merged"]);

  const { user } = await requireMypageSession();
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
      <Heading level={1}>予約</Heading>
      {justCancelledSingle && (
        <FlashMessage queryKey="cancelled">
          <p className="font-medium">予約をキャンセルしました</p>
          <p className="mt-1 text-muted-foreground">
            キャンセル完了の確認メールをお送りしました。
          </p>
        </FlashMessage>
      )}
      {justCancelledSeries && (
        <FlashMessage queryKey="cancelled">
          <p className="font-medium">連続予約をすべてキャンセルしました</p>
          <p className="mt-1 text-muted-foreground">
            シリーズに含まれる予約をまとめてキャンセルしました。確認メールをお送りしています。
          </p>
        </FlashMessage>
      )}
      {justMerged && (
        <FlashMessage queryKey="merged">
          <p className="font-medium">{MERGE_SUCCESS_MESSAGE}</p>
        </FlashMessage>
      )}
      <ReservationTabs activeItems={activeItems} pastItems={pastItems} />
    </Stack>
  );
}
