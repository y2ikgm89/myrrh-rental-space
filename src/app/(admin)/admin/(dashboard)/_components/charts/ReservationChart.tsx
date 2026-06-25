"use client";

/**
 * ReservationChart
 *
 * 直近 30 日の予約数（Bar）・売上（Area + Line）推移グラフ。
 *
 * - Recharts 3.0+ は `accessibilityLayer` デフォルト ON（明示不要）
 * - SVG props は CSS 変数を直接受け取れないため admin.css 同期 oklch を定数化
 * - X 軸ラベルは ISO 8601 文字列を JST `M/D` に整形（業界標準ダッシュボード）
 * - Tooltip は `role="status" aria-live="polite"` でスクリーンリーダー対応
 * - ResponsiveContainer を撤廃し ResizeObserver で width 確定後にのみ
 *   `<ComposedChart width={N} height={N}>` を render（recharts/recharts#2873 の
 *   dev-only race warning を完全消去するための公式回避パターン）
 */

import { useEffect, useRef, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import type {
  ChartDataPoint,
  ReservationChartSummary,
} from "@/shared/domain/dashboard/queries";
import { formatPrice } from "@/shared/lib/pricing/format";
import { formatCount } from "@/shared/lib/format/count";

/** dashboard chart の業界標準比率（IBM Carbon / Stripe / Vercel Analytics） */
const CHART_ASPECT_RATIO = 3;
/** 狭い viewport (< 720px) でも最低 240px を保証 */
const CHART_MIN_HEIGHT = 240;

/**
 * 親要素の width を ResizeObserver で観測し、`width > 0` 確定後の値のみ返す。
 * Recharts の `<ResponsiveContainer width="100%" height="100%">` は dynamic
 * loading + 初回 measure で `-1` を返すため、自前 observe + 条件付き render で回避。
 */
function useChartContainerSize(): {
  ref: React.RefObject<HTMLDivElement | null>;
  width: number;
  height: number;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const next = Math.floor(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const height = Math.max(
    Math.floor(width / CHART_ASPECT_RATIO),
    CHART_MIN_HEIGHT,
  );
  return { ref, width, height };
}

type ReservationChartProps = {
  data: ChartDataPoint[];
  summary: ReservationChartSummary;
  windowDays: number;
};

const CHART_COLORS = {
  /** --color-border: oklch(0.9 0.01 250) */
  grid: "oklch(0.9 0.01 250)",
  /** --color-primary: oklch(0.55 0.2 260) — Trust Blue */
  reservations: "oklch(0.55 0.2 260)",
  /** --color-success: oklch(0.65 0.17 155) */
  revenue: "oklch(0.65 0.17 155)",
  /** --color-muted-foreground: oklch(0.55 0.02 250) — 通常 tick */
  axisLabel: "oklch(0.55 0.02 250)",
  /** --color-foreground: oklch(0.2 0.02 260) — landmark tick（Carbon Design System 推奨） */
  axisLabelStrong: "oklch(0.2 0.02 260)",
  /** --color-muted: oklch(0.95 0.01 250) — tooltip cursor 背景 */
  cursor: "oklch(0.95 0.01 250)",
} as const;

const REVENUE_GRADIENT_ID = "reservation-chart-revenue-gradient";

const FULL_DATE_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

function isoDateToJstDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00+09:00`);
}

/**
 * IBM Carbon Design System 準拠の landmark-aware X 軸 tick 集合:
 * - 開始（必須・landmark）
 * - 月初 1 日（必須・landmark / Carbon: "新しい時間単位に入るラベルは強調"）
 * - 7 日刻み（通常 tick）
 * - 末尾（必須・landmark）
 *
 * 近接（< MIN_GAP 日）の重複は priority の高い landmark を優先して間引く。
 * priority: 0 = 開始/末尾, 1 = 月初, 2 = 週次。
 */
type XAxisTickCandidate = {
  index: number;
  date: string;
  priority: 0 | 1 | 2;
};

function buildXAxisTicks(data: ChartDataPoint[]): string[] {
  if (data.length === 0) return [];
  const STEP_DAYS = 7;
  const MIN_GAP = 3;
  const lastIndex = data.length - 1;
  const candidates: XAxisTickCandidate[] = [];

  const first = data[0];
  if (first) candidates.push({ index: 0, date: first.date, priority: 0 });

  for (let i = 1; i < lastIndex; i++) {
    const point = data[i];
    if (!point) continue;
    if (point.date.endsWith("-01")) {
      candidates.push({ index: i, date: point.date, priority: 1 });
    } else if (i % STEP_DAYS === 0) {
      candidates.push({ index: i, date: point.date, priority: 2 });
    }
  }

  if (lastIndex > 0) {
    const last = data[lastIndex];
    if (last) {
      candidates.push({ index: lastIndex, date: last.date, priority: 0 });
    }
  }

  candidates.sort((a, b) => a.index - b.index);

  const result: XAxisTickCandidate[] = [];
  for (const candidate of candidates) {
    const previous = result[result.length - 1];
    if (!previous) {
      result.push(candidate);
      continue;
    }
    if (candidate.index - previous.index < MIN_GAP) {
      // 近接 — priority 値が小さい（重要度が高い）方を残す
      if (candidate.priority < previous.priority) {
        result.pop();
        result.push(candidate);
      }
      continue;
    }
    result.push(candidate);
  }

  return result.map((c) => c.date);
}

function isLandmarkTick(isoDate: string, index: number): boolean {
  return index === 0 || isoDate.endsWith("-01");
}

function formatTooltipDate(isoDate: string): string {
  return FULL_DATE_FORMATTER.format(isoDateToJstDate(isoDate));
}

function formatRevenueAxis(value: number): string {
  if (value === 0) return "0";
  if (value >= 100_000_000) {
    const oku = value / 100_000_000;
    return Number.isInteger(oku) ? `${oku}億` : `${oku.toFixed(1)}億`;
  }
  if (value >= 10_000) {
    const man = value / 10_000;
    return Number.isInteger(man) ? `${man}万` : `${man.toFixed(1)}万`;
  }
  return formatCount(value);
}

/**
 * Recharts の `tick` prop に渡すカスタム SVG コンポーネント。
 * landmark（開始 / 月初）は semibold + 濃色（Carbon Design System 推奨）、
 * 通常 tick は regular + muted で視覚的階層を作る。
 */
type XAxisTickProps = {
  x?: number;
  y?: number;
  index?: number;
  payload?: { value: string };
};

function XAxisTick({ x = 0, y = 0, index = 0, payload }: XAxisTickProps) {
  const value = payload?.value;
  if (typeof value !== "string") return null;
  const [, monthStr, dayStr] = value.split("-");
  const month = Number(monthStr);
  const day = Number(dayStr);
  const landmark = isLandmarkTick(value, index);
  const label = landmark ? `${month}/${day}` : String(day);
  return (
    <text
      x={x}
      y={y}
      dy={14}
      textAnchor="middle"
      fontSize={11}
      fontWeight={landmark ? 600 : 400}
      fill={landmark ? CHART_COLORS.axisLabelStrong : CHART_COLORS.axisLabel}
    >
      {label}
    </text>
  );
}

type ChartTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: ReadonlyArray<{
    dataKey?: string | number;
    value?: number | string;
    name?: string;
  }>;
};

function ReservationTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length || typeof label !== "string") return null;

  const reservationsValue =
    payload.find((p) => p.dataKey === "reservations")?.value ?? 0;
  const revenueValue = payload.find((p) => p.dataKey === "revenue")?.value ?? 0;

  const reservations =
    typeof reservationsValue === "number" ? reservationsValue : 0;
  const revenue = typeof revenueValue === "number" ? revenueValue : 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm"
    >
      <p className="mb-1.5 font-medium text-foreground">
        {formatTooltipDate(label)}
      </p>
      <dl className="space-y-1">
        <div className="flex items-center justify-between gap-6">
          <dt className="flex items-center gap-1.5 text-muted-foreground">
            <span
              aria-hidden
              className="inline-block size-2 rounded-sm"
              style={{ backgroundColor: CHART_COLORS.reservations }}
            />
            予約数
          </dt>
          <dd className="font-medium tabular-nums text-foreground">
            {formatCount(reservations)} 件
          </dd>
        </div>
        <div className="flex items-center justify-between gap-6">
          <dt className="flex items-center gap-1.5 text-muted-foreground">
            <span
              aria-hidden
              className="inline-block h-0.5 w-3"
              style={{ backgroundColor: CHART_COLORS.revenue }}
            />
            売上
          </dt>
          <dd className="font-medium tabular-nums text-foreground">
            {formatPrice(revenue)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </dd>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function ReservationChart({
  data,
  summary,
  windowDays,
}: ReservationChartProps) {
  const chartTitle = `予約・売上推移（直近${windowDays}日）`;
  const chartDescription = `直近${windowDays}日間の予約数（左軸・件）と売上（右軸・円）の日次推移。合計予約数 ${formatCount(summary.totalReservations)} 件、合計売上 ${formatPrice(summary.totalRevenue)}。`;
  const xAxisTicks = buildXAxisTicks(data);
  const { ref: chartContainerRef, width, height } = useChartContainerSize();

  return (
    <Card>
      <CardHeader className="space-y-4">
        <CardTitle className="text-base">{chartTitle}</CardTitle>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 @md/main:grid-cols-4">
          <SummaryStat
            label="合計予約数"
            value={`${formatCount(summary.totalReservations)} 件`}
            hint={`平均 ${summary.averageReservationsPerDay.toFixed(1)} 件/日`}
          />
          <SummaryStat
            label="合計売上"
            value={formatPrice(summary.totalRevenue)}
            hint={`平均 ${formatPrice(Math.round(summary.averageRevenuePerDay))}/日`}
          />
          <SummaryStat
            label="ピーク予約数"
            value={`${formatCount(summary.peakReservations)} 件`}
            hint="1日あたり最大"
          />
          <SummaryStat
            label="ピーク売上"
            value={formatPrice(summary.peakRevenue)}
            hint="1日あたり最大"
          />
        </dl>
      </CardHeader>
      <CardContent className="pt-0">
        <figure className="space-y-3">
          {/*
            ResponsiveContainer 撤廃 — dynamic({ ssr: false }) との組合せで初回 measure
            時に width=-1 を返し chart 描画前に warning が出る known issue
            (recharts/recharts#2873)。`aspect` / `minHeight` プロップでも race の発生
            自体は防げないため、自前 ResizeObserver で width 確定後にのみ
            `<ComposedChart width={N} height={N}>` を直接 render する。
            initial paint 中はプレースホルダー高さで CLS を抑制。
          */}
          <div
            ref={chartContainerRef}
            role="img"
            aria-label={chartDescription}
            style={{ minHeight: CHART_MIN_HEIGHT }}
          >
            {width > 0 ? (
              <ComposedChart
                data={data}
                width={width}
                height={height}
                margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                barCategoryGap="25%"
                title={chartTitle}
              >
                <defs>
                  <linearGradient
                    id={REVENUE_GRADIENT_ID}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={CHART_COLORS.revenue}
                      stopOpacity={0.18}
                    />
                    <stop
                      offset="100%"
                      stopColor={CHART_COLORS.revenue}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke={CHART_COLORS.grid}
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="date"
                  tick={<XAxisTick />}
                  tickLine={false}
                  axisLine={false}
                  ticks={xAxisTicks}
                  tickMargin={10}
                  minTickGap={0}
                  padding={{ left: 8, right: 8 }}
                  interval={0}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: CHART_COLORS.axisLabel }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: CHART_COLORS.axisLabel }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatRevenueAxis}
                  width={48}
                />
                <Tooltip
                  cursor={{ fill: CHART_COLORS.cursor }}
                  content={<ReservationTooltip />}
                />
                <Bar
                  yAxisId="left"
                  dataKey="reservations"
                  fill={CHART_COLORS.reservations}
                  name="予約数"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={20}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="revenue"
                  stroke={CHART_COLORS.revenue}
                  strokeWidth={2}
                  fill={`url(#${REVENUE_GRADIENT_ID})`}
                  name="売上"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </ComposedChart>
            ) : null}
          </div>
          <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block size-2.5 rounded-sm"
                style={{ backgroundColor: CHART_COLORS.reservations }}
              />
              予約数（左軸 / 件）
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-0.5 w-4"
                style={{ backgroundColor: CHART_COLORS.revenue }}
              />
              売上（右軸 / 円）
            </span>
          </figcaption>
        </figure>
      </CardContent>
    </Card>
  );
}
