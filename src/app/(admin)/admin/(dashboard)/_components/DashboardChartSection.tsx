/**
 * DashboardChartSection
 *
 * ダッシュボードのグラフセクション
 * Server Component - データ取得後にClient Componentへ渡す
 */

import { connection } from "next/server";
import { getReservationChartData } from "@/admin/queries/dashboard";
import { ReservationChart } from "./charts";
import { DashboardSectionError } from "./DashboardSectionError";
import { settleDashboardLoad } from "./settle-dashboard-load";

export async function DashboardChartSection() {
  await connection();

  const result = await settleDashboardLoad(() => getReservationChartData());

  if (!result.ok) {
    return <DashboardSectionError title="予約・売上推移" />;
  }

  return (
    <ReservationChart
      data={result.value.data}
      summary={result.value.summary}
      windowDays={result.value.windowDays}
    />
  );
}
