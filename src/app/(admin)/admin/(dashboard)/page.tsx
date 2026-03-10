/**
 * 管理画面ダッシュボード
 *
 * Next.js 16 + React 19 Suspense Streaming:
 * - 各セクションを独立したasync Server Componentsに分割
 * - Suspense境界でプログレッシブレンダリング
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Suspense } from "react";
import { connection } from "next/server";
import { DashboardHeader } from "./_components/DashboardHeader";
import { DashboardStatsSection } from "./_components/DashboardStatsSection";
import { DashboardChartSection } from "./_components/DashboardChartSection";
import { DashboardTodaySection } from "./_components/DashboardTodaySection";
import { DashboardRecentSection } from "./_components/DashboardRecentSection";
import { AnalyticsCard } from "./_components/AnalyticsCard";
import {
  StatsCardsSkeleton,
  TodayReservationsSkeleton,
  RecentItemsSkeleton,
} from "./_components/skeletons";

function ChartSkeleton() {
  return <div className="h-80 animate-pulse rounded-lg bg-muted" />;
}

export const metadata: Metadata = {
  title: "ダッシュボード | 管理画面",
};

function DashboardHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="h-8 w-40 animate-pulse rounded bg-muted mb-1" />
        <div className="h-5 w-48 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-10 w-32 animate-pulse rounded bg-muted" />
    </div>
  );
}

export default async function AdminDashboard(): Promise<ReactElement> {
  await connection();
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <Suspense fallback={<DashboardHeaderSkeleton />}>
        <DashboardHeader />
      </Suspense>

      {/* 統計カード: 最も高速なDBクエリ */}
      <Suspense fallback={<StatsCardsSkeleton />}>
        <DashboardStatsSection />
      </Suspense>

      {/* 予約・売上推移グラフ */}
      <Suspense fallback={<ChartSkeleton />}>
        <DashboardChartSection />
      </Suspense>

      {/* アクセス解析: 外部API（Google Analytics）で最も遅い */}
      <Suspense
        fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" />}
      >
        <AnalyticsCard />
      </Suspense>

      {/* 本日の予約: フィルタ済みクエリ */}
      <Suspense fallback={<TodayReservationsSkeleton />}>
        <DashboardTodaySection />
      </Suspense>

      {/* 最近の予約/お問い合わせ: 2つの並列クエリ */}
      <Suspense fallback={<RecentItemsSkeleton />}>
        <DashboardRecentSection />
      </Suspense>
    </div>
  );
}
