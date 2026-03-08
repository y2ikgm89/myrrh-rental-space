import "server-only";

import { prisma } from "@/shared/db/prisma";
import { ReservationStatus } from "@/shared/db/enums";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import type { ReservationWhereInput } from "@/shared/types/prisma";

export async function getReservationsQuery(
  filters: {
    status?: ReservationStatus | "ALL";
    search?: string;
    startDate?: string;
    endDate?: string;
    spaceId?: string;
  } = {},
  pagination: {
    page?: number;
    limit?: number;
    sortBy?: "startTime" | "createdAt";
    sortOrder?: "asc" | "desc";
  } = {},
) {
  const { status, search, startDate, endDate, spaceId } = filters;
  const {
    page = 1,
    limit = 10,
    sortBy = "startTime",
    sortOrder = "desc",
  } = pagination;

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

  const formattedReservations = reservations.map((reservation) => ({
    ...reservation,
    startTime: reservation.startTime.toISOString(),
    endTime: reservation.endTime.toISOString(),
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

export async function getReservationsForCalendarQuery(
  startDate: Date,
  endDate: Date,
  spaceId?: string,
  status?: ReservationStatus | "ALL",
) {
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

  const [total, pending, confirmed, cancelled, todayCount, thisWeekCount] =
    await Promise.all([
      prisma.reservation.count(),
      prisma.reservation.count({ where: { status: ReservationStatus.PENDING } }),
      prisma.reservation.count({
        where: { status: ReservationStatus.CONFIRMED },
      }),
      prisma.reservation.count({
        where: { status: ReservationStatus.CANCELLED },
      }),
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

export async function getSpacesForReservationQuery() {
  return toPlainArray(
    await prisma.space.findMany({
      where: { isActive: true, isPublished: true },
      select: { id: true, name: true, hourlyPrice: true },
      orderBy: { name: "asc" },
    }),
  );
}
