import "server-only";

import { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { InquiryStatus, ReservationStatus } from "@generated/prisma/enums";

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
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const JST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toJstDateString(date: Date): string {
  return JST_DATE_FORMATTER.format(date);
}

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
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
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

export async function getReservationChartData(): Promise<ReservationChartResult> {
  const todayJstStr = toJstDateString(new Date());
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
      AND status NOT IN (${excludedStatuses})
    GROUP BY TO_CHAR("createdAt" AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD')
    ORDER BY date ASC
  `;

  const dataMap = new Map<string, { reservations: number; revenue: number }>();
  for (let index = CHART_WINDOW_DAYS - 1; index >= 0; index--) {
    const dateUtc = new Date(
      todayJstMidnightUtc.getTime() - index * ONE_DAY_MS,
    );
    dataMap.set(toJstDateString(dateUtc), { reservations: 0, revenue: 0 });
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
