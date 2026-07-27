import "server-only";

import { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import {
  InquiryStatus,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { formatJstDateString, MS_PER_DAY } from "@/shared/lib/date-format";

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
  receiptNumber: string;
  name: string;
  email: string;
  subject: string;
  status: InquiryStatus;
  createdAt: Date;
};

export type ChartDataPoint = {
  /** ISO 8601 date string "YYYY-MM-DD"（JST 基準） */
  date: string;
  reservations: number;
  revenue: number;
};

export type ReservationChartSummary = {
  totalReservations: number;
  totalRevenue: number;
  averageReservationsPerDay: number;
  averageRevenuePerDay: number;
  peakReservations: number;
  peakRevenue: number;
};

export type ReservationChartResult = {
  data: ChartDataPoint[];
  summary: ReservationChartSummary;
  windowDays: number;
};

const DEFAULT_LIST_LIMIT = 5;
const MAX_LIST_LIMIT = 50;
const CHART_WINDOW_DAYS = 30;
const ONE_DAY_MS = MS_PER_DAY;

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

/** JST カレンダー月の 1 日 00:00 (+09:00) を返す。month は 1..12。 */
function getJstMonthStart(year: number, month: number): Date {
  const monthStr = String(month).padStart(2, "0");
  return new Date(`${year}-${monthStr}-01T00:00:00+09:00`);
}

function getJstMonthBoundaries(now: Date): {
  thisMonthStart: Date;
  lastMonthStart: Date;
} {
  const todayJstStr = formatJstDateString(now);
  const [yearStr, monthStr] = todayJstStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const thisMonthStart = getJstMonthStart(year, month);
  const lastMonthYear = month === 1 ? year - 1 : year;
  const lastMonth = month === 1 ? 12 : month - 1;
  const lastMonthStart = getJstMonthStart(lastMonthYear, lastMonth);
  return { thisMonthStart, lastMonthStart };
}

function getJstTodayWindow(now: Date): {
  todayStart: Date;
  tomorrowStart: Date;
} {
  const todayJstStr = formatJstDateString(now);
  const todayStart = new Date(`${todayJstStr}T00:00:00+09:00`);
  const tomorrowStart = new Date(todayStart.getTime() + MS_PER_DAY);
  return { todayStart, tomorrowStart };
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
  const { thisMonthStart, lastMonthStart } = getJstMonthBoundaries(new Date());

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
        deletedAt: null,
        createdAt: { gte: thisMonthStart },
        status: {
          notIn: [ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW],
        },
      },
    }),
    prisma.reservation.count({
      where: {
        deletedAt: null,
        createdAt: { gte: lastMonthStart, lt: thisMonthStart },
        status: {
          notIn: [ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW],
        },
      },
    }),
    prisma.reservation.aggregate({
      where: {
        deletedAt: null,
        createdAt: { gte: thisMonthStart },
        status: {
          in: [ReservationStatus.CONFIRMED, ReservationStatus.COMPLETED],
        },
      },
      _sum: { totalPrice: true },
    }),
    prisma.reservation.aggregate({
      where: {
        deletedAt: null,
        createdAt: { gte: lastMonthStart, lt: thisMonthStart },
        status: {
          in: [ReservationStatus.CONFIRMED, ReservationStatus.COMPLETED],
        },
      },
      _sum: { totalPrice: true },
    }),
    prisma.inquiry.count({
      where: { status: InquiryStatus.NEW, deletedAt: null },
    }),
    prisma.inquiry.count({
      where: {
        createdAt: { gte: thisMonthStart },
        deletedAt: null,
        status: { not: InquiryStatus.SPAM },
      },
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
    where: {
      deletedAt: null,
      status: {
        notIn: [ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW],
      },
    },
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
        select: { lastName: true, firstName: true },
      },
    },
  });

  return reservations.map(mapRecentReservation);
}

export async function getRecentInquiries(
  limit = DEFAULT_LIST_LIMIT,
): Promise<RecentInquiry[]> {
  const inquiries = await prisma.inquiry.findMany({
    where: { deletedAt: null },
    take: normalizeLimit(limit),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      receiptNumber: true,
      name: true,
      email: true,
      subject: true,
      status: true,
      createdAt: true,
    },
  });

  return inquiries;
}

export async function getTodayReservations(): Promise<RecentReservation[]> {
  const { todayStart, tomorrowStart } = getJstTodayWindow(new Date());

  const reservations = await prisma.reservation.findMany({
    where: {
      deletedAt: null,
      startTime: { gte: todayStart, lt: tomorrowStart },
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
        select: { lastName: true, firstName: true },
      },
    },
  });

  return reservations.map(mapRecentReservation);
}

export async function getReservationChartData(): Promise<ReservationChartResult> {
  const todayJstStr = formatJstDateString(new Date());
  const todayJstMidnightUtc = new Date(`${todayJstStr}T00:00:00+09:00`);
  const oldestJstMidnightUtc = new Date(
    todayJstMidnightUtc.getTime() - (CHART_WINDOW_DAYS - 1) * ONE_DAY_MS,
  );

  type DailyStats = {
    date: string;
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
      TO_CHAR("createdAt" AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') as date,
      COUNT(*)::bigint as reservations,
      SUM(CASE WHEN status IN (${revenueStatuses}) THEN "totalPrice"::numeric ELSE 0 END) as revenue
    FROM "reservations"
    WHERE "createdAt" >= ${oldestJstMidnightUtc}
      AND "deletedAt" IS NULL
      AND status NOT IN (${excludedStatuses})
    GROUP BY TO_CHAR("createdAt" AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD')
    ORDER BY date ASC
  `;

  const dataMap = new Map<string, { reservations: number; revenue: number }>();
  for (let index = CHART_WINDOW_DAYS - 1; index >= 0; index--) {
    const dateUtc = new Date(
      todayJstMidnightUtc.getTime() - index * ONE_DAY_MS,
    );
    dataMap.set(formatJstDateString(dateUtc), { reservations: 0, revenue: 0 });
  }

  for (const stat of dailyStats) {
    if (!dataMap.has(stat.date)) continue;
    dataMap.set(stat.date, {
      reservations: Number(stat.reservations),
      revenue: Number(stat.revenue ?? 0),
    });
  }

  const data: ChartDataPoint[] = Array.from(dataMap, ([date, value]) => ({
    date,
    reservations: value.reservations,
    revenue: value.revenue,
  }));

  let totalReservations = 0;
  let totalRevenue = 0;
  let peakReservations = 0;
  let peakRevenue = 0;
  for (const point of data) {
    totalReservations += point.reservations;
    totalRevenue += point.revenue;
    if (point.reservations > peakReservations)
      peakReservations = point.reservations;
    if (point.revenue > peakRevenue) peakRevenue = point.revenue;
  }

  return {
    data,
    summary: {
      totalReservations,
      totalRevenue,
      averageReservationsPerDay: totalReservations / CHART_WINDOW_DAYS,
      averageRevenuePerDay: totalRevenue / CHART_WINDOW_DAYS,
      peakReservations,
      peakRevenue,
    },
    windowDays: CHART_WINDOW_DAYS,
  };
}
