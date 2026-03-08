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
} from "@/shared/domain/dashboard/queries";
import { requireAdminDashboardAccess } from "./_helpers";

export type {
  ChartDataPoint,
  DashboardStats,
  RecentInquiry,
  RecentReservation,
};

export async function getDashboardStats(): Promise<DashboardStats> {
  await requireAdminDashboardAccess();
  return getDashboardStatsQuery();
}

export async function getRecentReservations(
  limit = 5,
): Promise<RecentReservation[]> {
  await requireAdminDashboardAccess();
  return getRecentReservationsQuery(limit);
}

export async function getRecentInquiries(limit = 5): Promise<RecentInquiry[]> {
  await requireAdminDashboardAccess();
  return getRecentInquiriesQuery(limit);
}

export async function getTodayReservations(): Promise<RecentReservation[]> {
  await requireAdminDashboardAccess();
  return getTodayReservationsQuery();
}

export async function getReservationChartData(): Promise<ChartDataPoint[]> {
  await requireAdminDashboardAccess();
  return getReservationChartDataQuery();
}
