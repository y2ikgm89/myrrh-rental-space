/**
 * ダッシュボード統計セクション
 *
 * 各種KPIカードを表示
 */

import { getDashboardStats } from "@/admin/queries/dashboard";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui/card";
import { formatCurrency } from "@/shared/lib/utils";
import { formatChange, getChangeColor } from "@/admin/lib/utils";

export async function DashboardStatsSection() {
  const stats = await getDashboardStats();

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">今月の予約</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.reservations.thisMonth}件
          </div>
          <p
            className={`text-xs ${getChangeColor(stats.reservations.changePercent)}`}
          >
            {formatChange(stats.reservations.changePercent)} 前月比
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">今月の売上</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(stats.revenue.thisMonth)}
          </div>
          <p
            className={`text-xs ${getChangeColor(stats.revenue.changePercent)}`}
          >
            {formatChange(stats.revenue.changePercent)} 前月比
          </p>
        </CardContent>
      </Card>
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
    </div>
  );
}
