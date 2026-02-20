"use server";

import { prisma } from "@/shared/lib/prisma";
import { ReservationStatus } from "@/shared/generated/prisma/enums";
import { toPlainObject, toPlainArray } from "@/shared/lib/serialize";
import { checkReadPermissionFor } from "@/admin/lib/permissions";
import type { ReservationWhereInput } from "@/shared/types/prisma";

// =============================================================================
// Types
// =============================================================================

export type ReservationWithRelations = {
  id: string;
  spaceId: string;
  customerId: string;
  /** toPlainObject() でシリアライズ済み ISO 8601 文字列 */
  startTime: string;
  /** toPlainObject() でシリアライズ済み ISO 8601 文字列 */
  endTime: string;
  status: ReservationStatus;
  totalPrice: number | null;
  basePrice: number | null;
  couponId: string | null;
  couponDiscountAmount: number | null;
  durationDiscountAmount: number | null;
  notes: string | null;
  /** toPlainObject() でシリアライズ済み ISO 8601 文字列 */
  createdAt: string;
  /** toPlainObject() でシリアライズ済み ISO 8601 文字列 */
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

// =============================================================================
// Helper
// =============================================================================

const checkReadPermission = checkReadPermissionFor("reservation");

// =============================================================================
// Queries
// =============================================================================

/**
 * 予約一覧を取得
 */
export async function getReservations(
  filters: ReservationFilters = {},
  pagination: ReservationPagination = {},
): Promise<GetReservationsResult> {
  const hasPermission = await checkReadPermission();
  if (!hasPermission) {
    return { reservations: [], total: 0, page: 1, limit: 10, totalPages: 0 };
  }

  const { status, search, startDate, endDate, spaceId } = filters;

  const {
    page = 1,
    limit = 10,
    sortBy = "startTime",
    sortOrder = "desc",
  } = pagination;

  // Where条件を構築
  const where: ReservationWhereInput = {};

  if (status && status !== "ALL") {
    where.status = status;
  }

  if (spaceId) {
    where.spaceId = spaceId;
  }

  if (startDate || endDate) {
    where.startTime = {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate) }),
    };
  }

  if (search) {
    where.OR = [
      {
        customer: {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        },
      },
      {
        space: {
          name: { contains: search, mode: "insensitive" },
        },
      },
    ];
  }

  // 総件数と予約一覧を並列取得（N+1解消）
  const [total, reservations] = await prisma.$transaction([
    prisma.reservation.count({ where }),
    prisma.reservation.findMany({
      where,
      select: {
        id: true,
        spaceId: true,
        customerId: true,
        startTime: true,
        endTime: true,
        status: true,
        totalPrice: true,
        basePrice: true,
        couponId: true,
        couponDiscountAmount: true,
        durationDiscountAmount: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        space: {
          select: {
            id: true,
            name: true,
          },
        },
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const formattedReservations: ReservationWithRelations[] = reservations.map(
    (r) => ({
      ...r,
      startTime: r.startTime.toISOString(),
      endTime: r.endTime.toISOString(),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }),
  );

  return toPlainObject({
    reservations: formattedReservations,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

/**
 * 予約詳細を取得
 */
export async function getReservationById(
  id: string,
): Promise<ReservationWithRelations | null> {
  const hasPermission = await checkReadPermission();
  if (!hasPermission) {
    return null;
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    select: {
      id: true,
      spaceId: true,
      customerId: true,
      startTime: true,
      endTime: true,
      status: true,
      totalPrice: true,
      basePrice: true,
      couponId: true,
      couponDiscountAmount: true,
      durationDiscountAmount: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      space: {
        select: {
          id: true,
          name: true,
        },
      },
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
        },
      },
      coupon: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

  if (!reservation) {
    return null;
  }

  return toPlainObject({
    ...reservation,
    startTime: reservation.startTime.toISOString(),
    endTime: reservation.endTime.toISOString(),
    createdAt: reservation.createdAt.toISOString(),
    updatedAt: reservation.updatedAt.toISOString(),
  });
}

/**
 * カレンダー表示用予約データ取得
 */
export async function getReservationsForCalendar(
  startDate: Date,
  endDate: Date,
  spaceId?: string,
  status?: ReservationStatus | "ALL",
): Promise<
  {
    id: string;
    title: string;
    spaceId: string;
    spaceName: string;
    /** ISO 8601 文字列（React シリアライゼーション後は必ず string） */
    startTime: string;
    /** ISO 8601 文字列（React シリアライゼーション後は必ず string） */
    endTime: string;
    status: ReservationStatus;
    totalPrice: number | null;
    notes: string | null;
    customerName: string;
    customerEmail: string;
    customerPhone: string | null;
  }[]
> {
  const hasPermission = await checkReadPermission();
  if (!hasPermission) {
    return [];
  }

  // 期間と重複する予約を取得
  // 重複条件: reservation.startTime < endDate AND reservation.endTime > startDate
  const where: ReservationWhereInput = {
    AND: [{ startTime: { lt: endDate } }, { endTime: { gt: startDate } }],
  };

  if (spaceId) {
    where.spaceId = spaceId;
  }

  if (status && status !== "ALL") {
    where.status = status;
  }

  const reservations = await prisma.reservation.findMany({
    where,
    include: {
      space: { select: { id: true, name: true } },
      customer: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
        },
      },
    },
    orderBy: { startTime: "asc" },
  });

  return reservations.map((r) => ({
    id: r.id,
    title: `${r.customer.lastName} ${r.customer.firstName}`,
    spaceId: r.space.id,
    spaceName: r.space.name,
    startTime: r.startTime.toISOString(),
    endTime: r.endTime.toISOString(),
    status: r.status,
    totalPrice: r.totalPrice,
    notes: r.notes,
    customerName: `${r.customer.lastName} ${r.customer.firstName}`,
    customerEmail: r.customer.email,
    customerPhone: r.customer.phoneNumber,
  }));
}

/**
 * カレンダー用スペース一覧取得
 */
export async function getSpacesForCalendar(): Promise<
  { id: string; name: string }[]
> {
  const hasPermission = await checkReadPermission();
  if (!hasPermission) {
    return [];
  }

  const spaces = await prisma.space.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return spaces;
}

/**
 * 統計情報を取得（ダッシュボード用）
 */
export async function getReservationStats(): Promise<{
  total: number;
  pending: number;
  confirmed: number;
  cancelled: number;
  todayCount: number;
  thisWeekCount: number;
}> {
  const hasPermission = await checkReadPermission();
  if (!hasPermission) {
    return {
      total: 0,
      pending: 0,
      confirmed: 0,
      cancelled: 0,
      todayCount: 0,
      thisWeekCount: 0,
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const [total, pending, confirmed, cancelled, todayCount, thisWeekCount] =
    await Promise.all([
      prisma.reservation.count(),
      prisma.reservation.count({ where: { status: "PENDING" } }),
      prisma.reservation.count({ where: { status: "CONFIRMED" } }),
      prisma.reservation.count({ where: { status: "CANCELLED" } }),
      prisma.reservation.count({
        where: {
          startTime: {
            gte: today,
            lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.reservation.count({
        where: {
          startTime: {
            gte: weekStart,
          },
        },
      }),
    ]);

  return {
    total,
    pending,
    confirmed,
    cancelled,
    todayCount,
    thisWeekCount,
  };
}

/**
 * 予約作成用スペース一覧取得
 */
export async function getSpacesForReservation(): Promise<
  { id: string; name: string; hourlyPrice: number }[]
> {
  const hasPermissionResult = await checkReadPermission();
  if (!hasPermissionResult) {
    return [];
  }

  const spaces = await prisma.space.findMany({
    where: { isActive: true, isPublished: true },
    select: { id: true, name: true, hourlyPrice: true },
    orderBy: { name: "asc" },
  });

  return toPlainArray(spaces);
}
