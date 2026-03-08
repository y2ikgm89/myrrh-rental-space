"use server";

import { ReservationStatus } from "@/shared/db/enums";
import { checkReadPermissionFor } from "@/admin/lib/permissions";
import {
  getReservationByIdQuery,
  getReservationsForCalendarQuery,
  getReservationsQuery,
  getReservationStatsQuery,
  getSpacesForCalendarQuery,
  getSpacesForReservationQuery,
} from "@/shared/domain/reservations/admin-queries";

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
  createdAt: string;
  updatedAt: string;
  space: {
    id: string;
    name: string;
  };
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string | null;
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
  status?: ReservationStatus | "ALL";
  search?: string;
  startDate?: string;
  endDate?: string;
  spaceId?: string;
};

export type ReservationPagination = {
  page?: number;
  limit?: number;
  sortBy?: "startTime" | "createdAt";
  sortOrder?: "asc" | "desc";
};

const checkReadPermission = checkReadPermissionFor("reservation");

export async function getReservations(
  filters: ReservationFilters = {},
  pagination: ReservationPagination = {},
): Promise<GetReservationsResult> {
  if (!(await checkReadPermission())) {
    return { reservations: [], total: 0, page: 1, limit: 10, totalPages: 0 };
  }

  return getReservationsQuery(filters, pagination);
}

export async function getReservationById(
  id: string,
): Promise<ReservationWithRelations | null> {
  if (!(await checkReadPermission())) {
    return null;
  }

  return getReservationByIdQuery(id);
}

export async function getReservationsForCalendar(
  startDate: Date,
  endDate: Date,
  spaceId?: string,
  status?: ReservationStatus | "ALL",
) {
  if (!(await checkReadPermission())) {
    return [];
  }

  return getReservationsForCalendarQuery(startDate, endDate, spaceId, status);
}

export async function getSpacesForCalendar(): Promise<
  { id: string; name: string }[]
> {
  if (!(await checkReadPermission())) {
    return [];
  }

  return getSpacesForCalendarQuery();
}

export async function getReservationStats(): Promise<{
  total: number;
  pending: number;
  confirmed: number;
  cancelled: number;
  todayCount: number;
  thisWeekCount: number;
}> {
  if (!(await checkReadPermission())) {
    return {
      total: 0,
      pending: 0,
      confirmed: 0,
      cancelled: 0,
      todayCount: 0,
      thisWeekCount: 0,
    };
  }

  return getReservationStatsQuery();
}

export async function getSpacesForReservation(): Promise<
  { id: string; name: string; hourlyPrice: number }[]
> {
  if (!(await checkReadPermission())) {
    return [];
  }

  return getSpacesForReservationQuery();
}
