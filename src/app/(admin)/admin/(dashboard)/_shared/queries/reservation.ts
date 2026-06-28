import "server-only";

import type {
  DiscountCombinationMode,
  PaymentStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { getValidDiscountCombinationMode } from "@/shared/lib/validations/enums/helpers";
import type { ReservationTabFilter } from "@/shared/lib/nuqs";
import type { PaginationInput } from "@/shared/lib/pagination";
import {
  getReservationByIdQuery,
  getReservationsForCalendarQuery,
  getReservationsQuery,
  getReservationStatsQuery,
  getSpacesForCalendarQuery,
  getSpacesForReservationQuery,
} from "@/shared/domain/reservations/admin-queries";
import { getReservationSettings } from "@/shared/domain/reservations/payloads";
import { parseDurationDiscountRules } from "@/shared/lib/pricing/discount";
import type { DurationDiscountRule } from "@/shared/lib/pricing/types";
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

export type AdminReservationDiscountSettings = {
  durationDiscountEnabled: boolean;
  durationDiscountRules: DurationDiscountRule[];
  discountCombinationMode: DiscountCombinationMode;
};

export async function getReservationDiscountSettings(): Promise<AdminReservationDiscountSettings> {
  await requireAdminPermission("reservation", "read");
  const settings = await getReservationSettings();
  return {
    durationDiscountEnabled: settings?.durationDiscountEnabled ?? false,
    durationDiscountRules: parseDurationDiscountRules(
      settings?.durationDiscountRules,
    ),
    discountCombinationMode: getValidDiscountCombinationMode(
      settings?.discountCombinationMode,
    ),
  };
}
