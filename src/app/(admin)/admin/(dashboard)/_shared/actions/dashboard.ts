"use server";

import { connection } from "next/server";
import { prisma } from "@/shared/lib/prisma";
import { verifyAdminSession } from "@/shared/lib/auth";
import {
  ReservationStatus,
  InquiryStatus,
} from "@/shared/generated/prisma/enums";
import { toDateString } from "@/shared/lib/serialize";

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * 前月比の変化率を計算（%）
 */
function calcChangePercent(current: number, previous: number): number {
  if (previous > 0) {
    return Math.round(((current - previous) / previous) * 100);
  }
  if (current > 0) {
    return 100;
  }
  return 0;
}

// =============================================================================
// Actions
// =============================================================================

/**
 * ダッシュボード統計を取得
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  await verifyAdminSession();
  await connection();

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
    // 今月の予約数
    prisma.reservation.count({
      where: {
        createdAt: { gte: thisMonthStart },
        status: { not: ReservationStatus.CANCELLED },
      },
    }),
    // 先月の予約数
    prisma.reservation.count({
      where: {
        createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
        status: { not: ReservationStatus.CANCELLED },
      },
    }),
    // 今月の売上
    prisma.reservation.aggregate({
      where: {
        createdAt: { gte: thisMonthStart },
        status: ReservationStatus.CONFIRMED,
      },
      _sum: { totalPrice: true },
    }),
    // 先月の売上
    prisma.reservation.aggregate({
      where: {
        createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
        status: ReservationStatus.CONFIRMED,
      },
      _sum: { totalPrice: true },
    }),
    // 新規お問い合わせ（未対応）
    prisma.inquiry.count({
      where: { status: InquiryStatus.NEW },
    }),
    // 今月のお問い合わせ
    prisma.inquiry.count({
      where: { createdAt: { gte: thisMonthStart } },
    }),
    // アクティブスペース
    prisma.space.count({
      where: { isPublished: true, isActive: true },
    }),
    // 全スペース
    prisma.space.count(),
  ]);

  // 変化率の計算
  const reservationChange = calcChangePercent(
    thisMonthReservations,
    lastMonthReservations,
  );

  const thisMonthRevenueValue = Number(thisMonthRevenue._sum.totalPrice || 0);
  const lastMonthRevenueValue = Number(lastMonthRevenue._sum.totalPrice || 0);
  const revenueChange = calcChangePercent(
    thisMonthRevenueValue,
    lastMonthRevenueValue,
  );

  return {
    reservations: {
      thisMonth: thisMonthReservations,
      lastMonth: lastMonthReservations,
      changePercent: reservationChange,
    },
    revenue: {
      thisMonth: thisMonthRevenueValue,
      lastMonth: lastMonthRevenueValue,
      changePercent: revenueChange,
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

/**
 * 最近の予約を取得
 */
export async function getRecentReservations(
  limit = 5,
): Promise<RecentReservation[]> {
  await verifyAdminSession();

  const reservations = await prisma.reservation.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      totalPrice: true,
      space: { select: { name: true } },
      customer: { select: { lastName: true, firstName: true } },
    },
  });

  return reservations.map((r) => ({
    id: r.id,
    spaceName: r.space.name,
    customerName: `${r.customer.lastName} ${r.customer.firstName}`,
    startTime: r.startTime,
    endTime: r.endTime,
    status: r.status,
    totalPrice: r.totalPrice,
  }));
}

/**
 * 最近のお問い合わせを取得
 */
export async function getRecentInquiries(limit = 5): Promise<RecentInquiry[]> {
  await verifyAdminSession();

  const inquiries = await prisma.inquiry.findMany({
    take: limit,
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

  return inquiries.map((i) => ({
    id: i.id,
    name: i.name,
    email: i.email,
    subject: i.subject,
    status: i.status,
    createdAt: i.createdAt,
  }));
}

/**
 * 今日の予約を取得
 */
export async function getTodayReservations(): Promise<RecentReservation[]> {
  await verifyAdminSession();
  await connection();

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
      status: { not: ReservationStatus.CANCELLED },
    },
    orderBy: { startTime: "asc" },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      totalPrice: true,
      space: { select: { name: true } },
      customer: { select: { lastName: true, firstName: true } },
    },
  });

  return reservations.map((r) => ({
    id: r.id,
    spaceName: r.space.name,
    customerName: `${r.customer.lastName} ${r.customer.firstName}`,
    startTime: r.startTime,
    endTime: r.endTime,
    status: r.status,
    totalPrice: r.totalPrice,
  }));
}

// =============================================================================
// Chart Data Types
// =============================================================================

export type ChartDataPoint = {
  date: string;
  reservations: number;
  revenue: number;
};

/**
 * 直近30日の予約・売上推移データを取得
 */
export async function getReservationChartData(): Promise<ChartDataPoint[]> {
  await verifyAdminSession();
  await connection();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // DB側で日付ごとに集計
  // NOTE: Prisma の tagged template literal ($queryRaw`...`) は
  // 補間された値を自動的にパラメータ化するため、SQL Injection に対して安全
  // @see https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries#queryraw
  type DailyStats = {
    date: Date;
    reservations: bigint;
    revenue: number | null;
  };

  const dailyStats = await prisma.$queryRaw<DailyStats[]>`
    SELECT
      DATE("createdAt") as date,
      COUNT(*)::bigint as reservations,
      SUM(CASE WHEN status = 'CONFIRMED' THEN "totalPrice"::numeric ELSE 0 END) as revenue
    FROM "reservations"
    WHERE "createdAt" >= ${thirtyDaysAgo}
      AND status != 'CANCELLED'
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `;

  // 30日分の日付マップを初期化
  const dataMap = new Map<string, { reservations: number; revenue: number }>();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = toDateString(date);
    dataMap.set(dateStr, { reservations: 0, revenue: 0 });
  }

  // DB集計結果をマージ
  for (const stat of dailyStats) {
    const dateStr = toDateString(stat.date);
    if (dataMap.has(dateStr)) {
      dataMap.set(dateStr, {
        reservations: Number(stat.reservations),
        revenue: Number(stat.revenue || 0),
      });
    }
  }

  // 配列に変換
  return Array.from(dataMap.entries()).map(([date, data]) => ({
    date: date.slice(5), // MM-DD形式
    reservations: data.reservations,
    revenue: data.revenue,
  }));
}
