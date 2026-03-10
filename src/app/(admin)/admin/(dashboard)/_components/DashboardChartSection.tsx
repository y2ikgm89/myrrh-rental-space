/**
 * DashboardChartSection
 *
 * ダッシュボードのグラフセクション
 * Server Component - データ取得後にClient Componentへ渡す
 */

import { getReservationChartData } from "@/admin/queries/dashboard";
import { ReservationChart } from "./charts";

export async function DashboardChartSection() {
  const chartData = await getReservationChartData();

  return <ReservationChart data={chartData} />;
}
