/**
 * DashboardChartSection
 *
 * ダッシュボードのグラフセクション
 * Server Component - データ取得後にClient Componentへ渡す
 */

import { connection } from "next/server";
import { getReservationChartData } from "@/admin/queries/dashboard";
import { ReservationChart } from "./charts";

export async function DashboardChartSection() {
  await connection();
  const chartData = await getReservationChartData();

  return <ReservationChart data={chartData} />;
}
