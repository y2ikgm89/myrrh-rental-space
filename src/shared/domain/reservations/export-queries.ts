import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  buildReservationListWhere,
  type ReservationListFilters,
} from "@/shared/domain/reservations/admin-queries";

/**
 * 予約 CSV export。where 句は一覧クエリ (getReservationsQuery) と
 * `buildReservationListWhere` を共有する。
 *
 * Round-4 audit Finding #13 / medium: 旧実装は無条件 findMany（deletedAt: null
 * のみ）で、一覧側で tab=cancelled や検索語・期間・userId を絞り込んでいても
 * export だけ全件（他顧客・他ステータス含む）が出力されていた。管理者が
 * 画面に見えている行だけを出力するつもりで押しても PII を含む無関係な行まで
 * 漏れる forensic/PII リスクのある不整合だったため、一覧と同じ where 構築
 * ロジックを共有する。
 */
export async function getReservationsForExport(
  filters: ReservationListFilters = {},
) {
  return prisma.reservation.findMany({
    where: buildReservationListWhere(filters),
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      paymentStatus: true,
      totalPrice: true,
      basePrice: true,
      couponDiscountAmount: true,
      durationDiscountAmount: true,
      spaceDiscountAmount: true,
      notes: true,
      createdAt: true,
      guestLastName: true,
      guestFirstName: true,
      guestPhone: true,
      guestCompanyName: true,
      space: { select: { name: true } },
      customer: {
        select: {
          lastName: true,
          firstName: true,
          email: true,
          phoneNumber: true,
          companyName: true,
        },
      },
      coupon: { select: { code: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
