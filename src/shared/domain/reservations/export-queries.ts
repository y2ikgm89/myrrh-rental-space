import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  buildReservationListWhere,
  type ReservationListFilters,
} from "@/shared/domain/reservations/admin-queries";
import {
  ADMIN_EXPORT_ROW_LIMIT,
  type ExportRowsResult,
} from "@/shared/domain/exports/limits";
import type { Prisma } from "@/shared/lib/validations/enums/prisma-types";

const RESERVATION_EXPORT_SELECT = {
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
} as const satisfies Prisma.ReservationSelect;

export type ReservationExportRow = Prisma.ReservationGetPayload<{
  select: typeof RESERVATION_EXPORT_SELECT;
}>;

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
): Promise<ExportRowsResult<ReservationExportRow>> {
  const where = buildReservationListWhere(filters);
  const rows = await prisma.reservation.findMany({
    where,
    select: RESERVATION_EXPORT_SELECT,
    orderBy: { createdAt: "desc" },
    // 行数上限は 5 本の export で共通（監査 A-32）。
    take: ADMIN_EXPORT_ROW_LIMIT + 1,
  });

  if (rows.length > ADMIN_EXPORT_ROW_LIMIT) {
    return {
      truncated: true,
      totalCount: await prisma.reservation.count({ where }),
    };
  }
  return { truncated: false, rows };
}
