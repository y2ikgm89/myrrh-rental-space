import "server-only";

import {
  getDashboardStats as getDashboardStatsQuery,
  getRecentInquiries as getRecentInquiriesQuery,
  getRecentReservations as getRecentReservationsQuery,
  getReservationChartData as getReservationChartDataQuery,
  getTodayReservations as getTodayReservationsQuery,
  type ChartDataPoint,
  type DashboardStats,
  type RecentInquiry,
  type RecentReservation,
  type ReservationChartResult,
  type ReservationChartSummary,
} from "@/shared/domain/dashboard/queries";
import { hasPermission } from "@/shared/lib/admin-permissions";
import {
  requireAdminDashboardAccess,
  requireAdminPermission,
} from "./_helpers";

export type {
  ChartDataPoint,
  DashboardStats,
  RecentInquiry,
  RecentReservation,
  ReservationChartResult,
  ReservationChartSummary,
};

const EMPTY_RESERVATION_STATS: DashboardStats["reservations"] = {
  thisMonth: 0,
  lastMonth: 0,
  changePercent: 0,
};

const EMPTY_REVENUE_STATS: DashboardStats["revenue"] = {
  thisMonth: 0,
  lastMonth: 0,
  changePercent: 0,
};

const EMPTY_INQUIRY_STATS: DashboardStats["inquiries"] = {
  new: 0,
  thisMonth: 0,
};

const EMPTY_SPACE_STATS: DashboardStats["spaces"] = {
  active: 0,
  total: 0,
};

/**
 * ダッシュボード統計。
 * reservation / inquiry / space のいずれかの read が必要。
 * 権限のないスライスはゼロでマスクして返す（UI 側でもカードを gate する）。
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const user = await requireAdminDashboardAccess();
  const canReservation = hasPermission(user.role, "reservation", "read");
  const canInquiry = hasPermission(user.role, "inquiry", "read");
  const canSpace = hasPermission(user.role, "space", "read");

  if (!canReservation && !canInquiry && !canSpace) {
    return {
      reservations: EMPTY_RESERVATION_STATS,
      revenue: EMPTY_REVENUE_STATS,
      inquiries: EMPTY_INQUIRY_STATS,
      spaces: EMPTY_SPACE_STATS,
    };
  }

  const stats = await getDashboardStatsQuery();

  return {
    reservations: canReservation ? stats.reservations : EMPTY_RESERVATION_STATS,
    revenue: canReservation ? stats.revenue : EMPTY_REVENUE_STATS,
    inquiries: canInquiry ? stats.inquiries : EMPTY_INQUIRY_STATS,
    spaces: canSpace ? stats.spaces : EMPTY_SPACE_STATS,
  };
}

export async function getRecentReservations(
  limit = 5,
): Promise<RecentReservation[]> {
  await requireAdminPermission("reservation", "read");
  return getRecentReservationsQuery(limit);
}

export async function getRecentInquiries(limit = 5): Promise<RecentInquiry[]> {
  await requireAdminPermission("inquiry", "read");
  return getRecentInquiriesQuery(limit);
}

export async function getTodayReservations(): Promise<RecentReservation[]> {
  await requireAdminPermission("reservation", "read");
  return getTodayReservationsQuery();
}

export async function getReservationChartData(): Promise<ReservationChartResult> {
  await requireAdminPermission("reservation", "read");
  return getReservationChartDataQuery();
}
