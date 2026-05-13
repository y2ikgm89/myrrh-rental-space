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
import { DashboardHeader } from "./_components/DashboardHeader";
import { DashboardStatsSection } from "./_components/DashboardStatsSection";
import { DashboardNotificationsSection } from "./_components/DashboardNotificationsSection";
import { DashboardChartSection } from "./_components/DashboardChartSection";
import { DashboardTodaySection } from "./_components/DashboardTodaySection";
import { DashboardRecentSection } from "./_components/DashboardRecentSection";
import { AnalyticsCard } from "./_components/AnalyticsCard";
import { StatsCardsSkeleton } from "./_components/skeletons/StatsCardsSkeleton";
import { TodayReservationsSkeleton } from "./_components/skeletons/TodayReservationsSkeleton";
import { RecentItemsSkeleton } from "./_components/skeletons/RecentItemsSkeleton";
import { Skeleton } from "@/admin/components/ui";

function ChartSkeleton() {
  return <Skeleton className="h-80 w-full rounded-lg" />;
}

function NotificationsSkeleton() {
  return <Skeleton className="h-64 w-full rounded-lg" />;
}

function AnalyticsSkeleton() {
  return <Skeleton className="h-64 w-full rounded-lg" />;
}

export const metadata: Metadata = {
  title: "ダッシュボード | 管理画面",
};

function DashboardHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" variant="text" />
        <Skeleton className="h-5 w-48" variant="text" />
      </div>
      <Skeleton className="h-11 w-32" />
    </div>
  );
}

export default async function AdminDashboard(): Promise<ReactElement> {
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

      {/* 最新通知 */}
      <Suspense fallback={<NotificationsSkeleton />}>
        <DashboardNotificationsSection />
      </Suspense>

      {/* 予約・売上推移グラフ */}
      <Suspense fallback={<ChartSkeleton />}>
        <DashboardChartSection />
      </Suspense>

      {/* アクセス解析: 外部API（Google Analytics）で最も遅い */}
      <Suspense fallback={<AnalyticsSkeleton />}>
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
