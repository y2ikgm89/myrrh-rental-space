import "server-only";

import type {
  PaymentStatus,
  TaxRateType,
} from "@/shared/lib/validations/enums/prisma-types";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import type { ReservationTabFilter } from "@/shared/lib/nuqs";
import type { PaginationInput } from "@/shared/lib/pagination";
import {
  getReservationByIdQuery,
  getReservationSeriesInfoQuery,
  getReservationsForCalendarQuery,
  getReservationsQuery,
  getReservationStatsQuery,
  getSpacesForCalendarQuery,
  getSpacesForReservationQuery,
} from "@/shared/domain/reservations/admin-queries";
import { requireAdminPermission } from "./_helpers";

export type ReservationWithRelations = {
  id: string;
  spaceId: string;
  customerId: string;
  startTime: string;
  endTime: string;
  status: ReservationStatus;
  totalPrice: number | null;
  basePrice: number | null;
  couponId: string | null;
  couponDiscountAmount: number | null;
  durationDiscountAmount: number | null;
  spaceDiscountAmount: number | null;
  taxRateType: TaxRateType | null;
  taxRate: number | null;
  taxAmount: number | null;
  totalPriceWithTax: number | null;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  paymentStatus: PaymentStatus;
  stripePaymentIntentId: string | null;
  paidAt: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  cancelledByType: string | null;
  guestLastName: string | null;
  guestFirstName: string | null;
  guestPhone: string | null;
  guestCompanyName: string | null;
  space: {
    id: string;
    name: string;
  };
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    companyName: string | null;
    email: string;
    phoneNumber: string | null;
    userId: string | null;
  };
  coupon?: {
    id: string;
    code: string;
    name: string;
  } | null;
  // task #7 PR#6 (領収書再発行): 現在有効な Receipt (@unique(reservationId) により最新
  // 1 件のみ返る、orphan 化された過去 revision は含まれない)。receipt が非 null なら
  // admin UI で「領収書を再発行」button を表示する。detail query のみで include、
  // list query は select しないため optional (undefined = list、null = detail 未発行、
  // object = detail 発行済)。
  receipt?: {
    id: string;
    serialNo: string;
    revision: number;
    reissuedFromId: string | null;
    issuedAt: string;
  } | null;
};

export type GetReservationsResult = {
  reservations: ReservationWithRelations[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type ReservationFilters = {
  tab?: ReservationTabFilter | undefined;
  search?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  spaceId?: string | undefined;
};

export type ReservationPagination = PaginationInput<"startTime" | "createdAt">;

export async function getReservations(
  filters: ReservationFilters = {},
  pagination: ReservationPagination = {},
): Promise<GetReservationsResult> {
  await requireAdminPermission("reservation", "read");
  return getReservationsQuery(filters, pagination);
}

export async function getReservationById(
  id: string,
): Promise<ReservationWithRelations | null> {
  await requireAdminPermission("reservation", "read");
  return getReservationByIdQuery(id);
}

/**
 * Phase B.2 task 23: 予約詳細ページで SeriesInfoSection を描画するための thin wrapper。
 * `requireAdminPermission("reservation", "read")` を通してから domain query を呼ぶ。
 */
export async function getReservationSeriesInfo(id: string) {
  await requireAdminPermission("reservation", "read");
  return getReservationSeriesInfoQuery(id);
}

export async function getReservationsForCalendar(
  startDate: Date,
  endDate: Date,
  spaceId?: string,
  status?: ReservationStatus | "ALL",
) {
  await requireAdminPermission("reservation", "read");
  return getReservationsForCalendarQuery(startDate, endDate, spaceId, status);
}

export async function getSpacesForCalendar(): Promise<
  { id: string; name: string }[]
> {
  await requireAdminPermission("reservation", "read");
  return getSpacesForCalendarQuery();
}

export async function getReservationStats(): Promise<{
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  noShow: number;
  todayCount: number;
  thisWeekCount: number;
}> {
  await requireAdminPermission("reservation", "read");
  return getReservationStatsQuery();
}

export async function getSpacesForReservation(): Promise<
  Awaited<ReturnType<typeof getSpacesForReservationQuery>>
> {
  await requireAdminPermission("reservation", "read");
  return getSpacesForReservationQuery();
}
