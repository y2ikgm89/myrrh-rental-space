"use server";

import { connection } from "next/server";
import { verifyAdminSession } from "@/shared/lib/auth";
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

export async function getDashboardStats(): Promise<DashboardStats> {
  await verifyAdminSession();
  await connection();

  return getDashboardStatsQuery();
}

export async function getRecentReservations(
  limit = 5,
): Promise<RecentReservation[]> {
  await verifyAdminSession();

  return getRecentReservationsQuery(limit);
}

export async function getRecentInquiries(
  limit = 5,
): Promise<RecentInquiry[]> {
  await verifyAdminSession();

  return getRecentInquiriesQuery(limit);
}

export async function getTodayReservations(): Promise<RecentReservation[]> {
  await verifyAdminSession();
  await connection();

  return getTodayReservationsQuery();
}

export async function getReservationChartData(): Promise<ChartDataPoint[]> {
  await verifyAdminSession();
  await connection();

  return getReservationChartDataQuery();
}
