import "server-only";

import { prisma } from "@/shared/db/prisma";
import { ReservationStatus } from "@generated/prisma/enums";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import type { ReservationWhereInput } from "@/shared/types/prisma";

export async function getReservationsQuery(
  filters: {
    status?: ReservationStatus | "ALL" | undefined;
    search?: string | undefined;
    startDate?: string | undefined;
    endDate?: string | undefined;
    spaceId?: string | undefined;
  } = {},
  pagination: {
    page?: number | undefined;
    limit?: number | undefined;
    sortBy?: "startTime" | "createdAt" | undefined;
    sortOrder?: "asc" | "desc" | undefined;
  } = {},
) {
  const { status, search, startDate, endDate, spaceId } = filters;
  const {
    page = 1,
    limit = 10,
    sortBy = "startTime",
    sortOrder = "desc",
  } = pagination;

  const where: ReservationWhereInput = { deletedAt: null };

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
        paymentStatus: true,
        totalPrice: true,
        basePrice: true,
        couponId: true,
        couponDiscountAmount: true,
        durationDiscountAmount: true,
        stripePaymentIntentId: true,
        paidAt: true,
        cancellationReason: true,
        cancelledAt: true,
        cancelledByType: true,
        guestLastName: true,
        guestFirstName: true,
        guestPhone: true,
        guestCompanyName: true,
        notes: true,
        deletedAt: true,
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
            companyName: true,
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

  const formattedReservations = reservations.map((reservation) => ({
    ...reservation,
    startTime: reservation.startTime.toISOString(),
    endTime: reservation.endTime.toISOString(),
    paidAt: reservation.paidAt?.toISOString() ?? null,
    createdAt: reservation.createdAt.toISOString(),
    updatedAt: reservation.updatedAt.toISOString(),
  }));

  return toPlainObject({
    reservations: formattedReservations,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

export async function getReservationByIdQuery(id: string) {
  const reservation = await prisma.reservation.findUnique({
    where: { id, deletedAt: null },
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
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
      paymentStatus: true,
      stripePaymentIntentId: true,
      paidAt: true,
      cancellationReason: true,
      cancelledAt: true,
      cancelledByType: true,
      guestLastName: true,
      guestFirstName: true,
      guestPhone: true,
      guestCompanyName: true,
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
          companyName: true,
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
    paidAt: reservation.paidAt?.toISOString() ?? null,
  });
}

export async function getReservationsForCalendarQuery(
  startDate: Date,
  endDate: Date,
  spaceId?: string,
  status?: ReservationStatus | "ALL",
) {
  const where: ReservationWhereInput = {
    deletedAt: null,
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
          companyName: true,
          email: true,
          phoneNumber: true,
        },
      },
    },
    orderBy: { startTime: "asc" },
  });

  return reservations.map((reservation) => ({
    id: reservation.id,
    title: `${reservation.customer.lastName} ${reservation.customer.firstName}`,
    spaceId: reservation.space.id,
    spaceName: reservation.space.name,
    startTime: reservation.startTime.toISOString(),
    endTime: reservation.endTime.toISOString(),
    status: reservation.status,
    totalPrice: reservation.totalPrice,
    notes: reservation.notes,
    customerName: `${reservation.customer.lastName} ${reservation.customer.firstName}`,
    customerEmail: reservation.customer.email,
    customerPhone: reservation.customer.phoneNumber,
  }));
}

export async function getSpacesForCalendarQuery() {
  return prisma.space.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getReservationStatsQuery() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const [
    total,
    pending,
    confirmed,
    completed,
    cancelled,
    noShow,
    todayCount,
    thisWeekCount,
  ] = await Promise.all([
    prisma.reservation.count({ where: { deletedAt: null } }),
    prisma.reservation.count({
      where: { deletedAt: null, status: ReservationStatus.PENDING },
    }),
    prisma.reservation.count({
      where: { deletedAt: null, status: ReservationStatus.CONFIRMED },
    }),
    prisma.reservation.count({
      where: { deletedAt: null, status: ReservationStatus.COMPLETED },
    }),
    prisma.reservation.count({
      where: { deletedAt: null, status: ReservationStatus.CANCELLED },
    }),
    prisma.reservation.count({
      where: { deletedAt: null, status: ReservationStatus.NO_SHOW },
    }),
    prisma.reservation.count({
      where: {
        deletedAt: null,
        startTime: {
          gte: today,
          lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.reservation.count({
      where: {
        deletedAt: null,
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
    completed,
    cancelled,
    noShow,
    todayCount,
    thisWeekCount,
  };
}

export async function getSpacesForReservationQuery() {
  return toPlainArray(
    await prisma.space.findMany({
      where: { isActive: true, isPublished: true },
      select: { id: true, name: true, hourlyPrice: true },
      orderBy: { name: "asc" },
    }),
  );
}

export async function getReservationGuestData(id: string) {
  return prisma.reservation.findUnique({
    where: { id, deletedAt: null },
    select: {
      customerId: true,
      guestLastName: true,
      guestFirstName: true,
      guestPhone: true,
      guestCompanyName: true,
    },
  });
}

export async function getReservationStatus(id: string) {
  return prisma.reservation.findUnique({
    where: { id, deletedAt: null },
    select: { status: true },
  });
}

/** 予約リマインダー cron 用: 指定日時窓内のアクティブ予約とメール用関連を取得 */
export async function findReservationsForReminderWindow(
  startOfWindow: Date,
  endOfWindow: Date,
) {
  return prisma.reservation.findMany({
    where: {
      startTime: { gte: startOfWindow, lte: endOfWindow },
      status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      deletedAt: null,
    },
    select: {
      id: true,
      status: true,
      startTime: true,
      endTime: true,
      notes: true,
      customer: {
        select: { firstName: true, lastName: true, email: true },
      },
      space: {
        select: {
          name: true,
          location: { select: { name: true } },
        },
      },
    },
  });
}
