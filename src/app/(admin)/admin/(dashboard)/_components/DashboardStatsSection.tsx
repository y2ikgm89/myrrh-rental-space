/**
 * ダッシュボード統計セクション
 *
 * 権限のある KPI カードのみ表示
 */

import { connection } from "next/server";
import { getDashboardStats } from "@/admin/queries/dashboard";
import { requireAdminDashboardAccess } from "@/admin/queries/_helpers";
import { hasPermission } from "@/shared/lib/admin-permissions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui/card";
import { formatCurrency } from "@/shared/lib/pricing/format";
import { formatChange, getChangeColor } from "@/admin/lib/utils";
import { cn } from "@/shared/lib/cn";
import { DashboardSectionError } from "./DashboardSectionError";
import { settleDashboardLoad } from "./settle-dashboard-load";

export async function DashboardStatsSection() {
  await connection();

  const result = await settleDashboardLoad(async () => {
    const user = await requireAdminDashboardAccess();
    const canReservation = hasPermission(user.role, "reservation", "read");
    const canInquiry = hasPermission(user.role, "inquiry", "read");
    const canSpace = hasPermission(user.role, "space", "read");

    if (!canReservation && !canInquiry && !canSpace) {
      return null;
    }

    const stats = await getDashboardStats();
    return { stats, canReservation, canInquiry, canSpace };
  });

  if (!result.ok) {
    return <DashboardSectionError title="統計" />;
  }

  if (result.value === null) {
    return null;
  }

  const { stats, canReservation, canInquiry, canSpace } = result.value;

  return (
    <div className="grid gap-4 @md/main:grid-cols-2 @3xl/main:grid-cols-4">
      {canReservation ? (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">今月の予約</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.reservations.thisMonth}件
              </div>
              <p
                className={cn(
                  "text-xs",
                  getChangeColor(stats.reservations.changePercent),
                )}
              >
                {formatChange(stats.reservations.changePercent)} 前月比
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                今月の売上（税抜）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(stats.revenue.thisMonth)}
              </div>
              <p
                className={cn(
                  "text-xs",
                  getChangeColor(stats.revenue.changePercent),
                )}
              >
                {formatChange(stats.revenue.changePercent)} 前月比
              </p>
            </CardContent>
          </Card>
        </>
      ) : null}
      {canInquiry ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              新規お問い合わせ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inquiries.new}件</div>
            <p className="text-xs text-muted-foreground">
              今月計: {stats.inquiries.thisMonth}件
            </p>
          </CardContent>
        </Card>
      ) : null}
      {canSpace ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              アクティブスペース
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.spaces.active}件</div>
            <p className="text-xs text-muted-foreground">
              全{stats.spaces.total}件中
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
