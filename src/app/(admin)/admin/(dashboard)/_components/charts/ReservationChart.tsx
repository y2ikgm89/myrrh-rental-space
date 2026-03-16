"use client";

/**
 * ReservationChart
 *
 * 直近30日の予約数・売上推移グラフ
 * Recharts使用
 *
 * NOTE: Recharts の SVG props は CSS 変数を直接受け取れないため、
 * admin.css テーマと一致する oklch 値を定数として定義する。
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import type { ChartDataPoint } from "@/shared/domain/dashboard/queries";

type ReservationChartProps = {
  data: ChartDataPoint[];
};

/**
 * チャート色定数 — admin.css テーマトークンと同期
 * Recharts SVG は CSS custom properties を直接受け取れないため oklch 値を定義
 */
const CHART_COLORS = {
  /** --color-border: oklch(0.9 0.01 250) */
  grid: "oklch(0.9 0.01 250)",
  /** --color-primary: oklch(0.55 0.2 260) — Trust Blue */
  reservations: "oklch(0.55 0.2 260)",
  /** --color-success: oklch(0.65 0.17 155) */
  revenue: "oklch(0.65 0.17 155)",
  /** --color-card: oklch(1 0 0) */
  tooltipBg: "oklch(1 0 0)",
} as const;

function formatCurrency(value: number): string {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }
  return value.toLocaleString();
}

export function ReservationChart({ data }: ReservationChartProps) {
  // データがない場合
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            予約・売上推移（直近30日）
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            データがありません
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">予約・売上推移（直近30日）</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={data}
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: CHART_COLORS.grid }}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={30}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatCurrency}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: CHART_COLORS.tooltipBg,
                border: `1px solid ${CHART_COLORS.grid}`,
                borderRadius: "6px",
                fontSize: "12px",
              }}
              formatter={(value, name) => {
                const numValue = typeof value === "number" ? value : 0;
                if (name === "売上") {
                  return [`¥${numValue.toLocaleString()}`, name];
                }
                return [numValue, name];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: "12px" }}
              iconType="circle"
              iconSize={8}
            />
            <Bar
              yAxisId="left"
              dataKey="reservations"
              fill={CHART_COLORS.reservations}
              name="予約数"
              radius={[2, 2, 0, 0]}
            />
            <Bar
              yAxisId="right"
              dataKey="revenue"
              fill={CHART_COLORS.revenue}
              name="売上"
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
