import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/shared/db/prisma";
import { InquiryStatus, ReservationStatus } from "@/shared/db/enums";
import { toDateString } from "@/shared/lib/serialize";

export type DashboardStats = {
  reservations: {
    thisMonth: number;
    lastMonth: number;
    changePercent: number;
  };
  revenue: {
    thisMonth: number;
    lastMonth: number;
    changePercent: number;
  };
  inquiries: {
    new: number;
    thisMonth: number;
  };
  spaces: {
    active: number;
    total: number;
  };
};

export type RecentReservation = {
  id: string;
  spaceName: string;
  customerName: string;
  startTime: Date;
  endTime: Date;
  status: ReservationStatus;
  totalPrice: number | null;
};

export type RecentInquiry = {
  id: string;
  name: string;
  email: string;
  subject: string;
  status: InquiryStatus;
  createdAt: Date;
};

export type ChartDataPoint = {
  date: string;
  reservations: number;
  revenue: number;
};

const DEFAULT_LIST_LIMIT = 5;
const MAX_LIST_LIMIT = 50;
const CHART_WINDOW_DAYS = 30;

function calcChangePercent(current: number, previous: number): number {
  if (previous > 0) {
    return Math.round(((current - previous) / previous) * 100);
  }
  if (current > 0) {
    return 100;
  }
  return 0;
}

function normalizeLimit(limit: number): number {
  if (limit < 1) {
    return DEFAULT_LIST_LIMIT;
  }

  return Math.min(limit, MAX_LIST_LIMIT);
}

function mapRecentReservation(reservation: {
  id: string;
  startTime: Date;
  endTime: Date;
  status: ReservationStatus;
  totalPrice: number | null;
  space: { name: string };
  customer: { lastName: string; firstName: string };
}): RecentReservation {
  return {
    id: reservation.id,
    spaceName: reservation.space.name,
    customerName: `${reservation.customer.lastName} ${reservation.customer.firstName}`,
    startTime: reservation.startTime,
    endTime: reservation.endTime,
    status: reservation.status,
    totalPrice: reservation.totalPrice,
  };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    0,
    23,
    59,
    59,
    999,
  );

  const [
    thisMonthReservations,
    lastMonthReservations,
    thisMonthRevenue,
    lastMonthRevenue,
    newInquiries,
    thisMonthInquiries,
    activeSpaces,
    totalSpaces,
  ] = await Promise.all([
    prisma.reservation.count({
      where: {
        createdAt: { gte: thisMonthStart },
        status: {
          notIn: [ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW],
        },
      },
    }),
    prisma.reservation.count({
      where: {
        createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
        status: {
          notIn: [ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW],
        },
      },
    }),
    prisma.reservation.aggregate({
      where: {
        createdAt: { gte: thisMonthStart },
        status: {
          in: [ReservationStatus.CONFIRMED, ReservationStatus.COMPLETED],
        },
      },
      _sum: { totalPrice: true },
    }),
    prisma.reservation.aggregate({
      where: {
        createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
        status: {
          in: [ReservationStatus.CONFIRMED, ReservationStatus.COMPLETED],
        },
      },
      _sum: { totalPrice: true },
    }),
    prisma.inquiry.count({
      where: { status: InquiryStatus.NEW },
    }),
    prisma.inquiry.count({
      where: { createdAt: { gte: thisMonthStart } },
    }),
    prisma.space.count({
      where: { isPublished: true, isActive: true },
    }),
    prisma.space.count(),
  ]);

  const thisMonthRevenueValue = Number(thisMonthRevenue._sum.totalPrice ?? 0);
  const lastMonthRevenueValue = Number(lastMonthRevenue._sum.totalPrice ?? 0);

  return {
    reservations: {
      thisMonth: thisMonthReservations,
      lastMonth: lastMonthReservations,
      changePercent: calcChangePercent(
        thisMonthReservations,
        lastMonthReservations,
      ),
    },
    revenue: {
      thisMonth: thisMonthRevenueValue,
      lastMonth: lastMonthRevenueValue,
      changePercent: calcChangePercent(
        thisMonthRevenueValue,
        lastMonthRevenueValue,
      ),
    },
    inquiries: {
      new: newInquiries,
      thisMonth: thisMonthInquiries,
    },
    spaces: {
      active: activeSpaces,
      total: totalSpaces,
    },
  };
}

export async function getRecentReservations(
  limit = DEFAULT_LIST_LIMIT,
): Promise<RecentReservation[]> {
  const reservations = await prisma.reservation.findMany({
    take: normalizeLimit(limit),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      totalPrice: true,
      space: { select: { name: true } },
      customer: {
        select: { lastName: true, firstName: true, companyName: true },
      },
    },
  });

  return reservations.map(mapRecentReservation);
}

export async function getRecentInquiries(
  limit = DEFAULT_LIST_LIMIT,
): Promise<RecentInquiry[]> {
  const inquiries = await prisma.inquiry.findMany({
    take: normalizeLimit(limit),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      subject: true,
      status: true,
      createdAt: true,
    },
  });

  return inquiries.map((inquiry) => ({
    id: inquiry.id,
    name: inquiry.name,
    email: inquiry.email,
    subject: inquiry.subject,
    status: inquiry.status,
    createdAt: inquiry.createdAt,
  }));
}

export async function getTodayReservations(): Promise<RecentReservation[]> {
  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const todayEnd = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    23,
    59,
    59,
    999,
  );

  const reservations = await prisma.reservation.findMany({
    where: {
      startTime: { gte: todayStart, lte: todayEnd },
      status: {
        notIn: [ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW],
      },
    },
    orderBy: { startTime: "asc" },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      totalPrice: true,
      space: { select: { name: true } },
      customer: {
        select: { lastName: true, firstName: true, companyName: true },
      },
    },
  });

  return reservations.map(mapRecentReservation);
}

export async function getReservationChartData(): Promise<ChartDataPoint[]> {
  const now = new Date();
  const oldestIncludedDate = new Date(
    now.getTime() - (CHART_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000,
  );

  type DailyStats = {
    date: Date;
    reservations: bigint;
    revenue: number | null;
  };

  const excludedStatuses = Prisma.join([
    ReservationStatus.CANCELLED,
    ReservationStatus.NO_SHOW,
  ]);
  const revenueStatuses = Prisma.join([
    ReservationStatus.CONFIRMED,
    ReservationStatus.COMPLETED,
  ]);

  const dailyStats = await prisma.$queryRaw<DailyStats[]>`
    SELECT
      DATE("createdAt") as date,
      COUNT(*)::bigint as reservations,
      SUM(CASE WHEN status IN (${revenueStatuses}) THEN "totalPrice"::numeric ELSE 0 END) as revenue
    FROM "reservations"
    WHERE "createdAt" >= ${oldestIncludedDate}
      AND status NOT IN (${excludedStatuses})
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `;

  const dataMap = new Map<string, { reservations: number; revenue: number }>();
  for (let index = CHART_WINDOW_DAYS - 1; index >= 0; index--) {
    const date = new Date(now.getTime() - index * 24 * 60 * 60 * 1000);
    dataMap.set(toDateString(date), { reservations: 0, revenue: 0 });
  }

  for (const stat of dailyStats) {
    const dateKey = toDateString(stat.date);
    const existing = dataMap.get(dateKey);
    if (!existing) {
      continue;
    }

    dataMap.set(dateKey, {
      reservations: Number(stat.reservations),
      revenue: Number(stat.revenue ?? 0),
    });
  }

  return Array.from(dataMap.entries()).map(([date, data]) => ({
    date: date.slice(5),
    reservations: data.reservations,
    revenue: data.revenue,
  }));
}
