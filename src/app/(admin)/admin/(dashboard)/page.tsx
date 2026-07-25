/**
 * 管理画面ダッシュボード
 *
 * Next.js 16 + React 19 Suspense Streaming:
 * - 各セクションを独立したasync Server Componentsに分割
 * - Suspense境界でプログレッシブレンダリング
 * - サイドバーと同じ resource:read でセクションを gate
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Suspense } from "react";
import { connection } from "next/server";
import { hasPermission } from "@/shared/lib/admin-permissions";
import { requireAdminDashboardAccess } from "@/admin/queries/_helpers";
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

export default async function AdminDashboard(): Promise<ReactElement> {
  await connection();
  const user = await requireAdminDashboardAccess();

  const canReadReservation = hasPermission(user.role, "reservation", "read");
  const canReadInquiry = hasPermission(user.role, "inquiry", "read");
  const canReadSpace = hasPermission(user.role, "space", "read");
  const canReadNotification = hasPermission(user.role, "notification", "read");
  const canReadSettings = hasPermission(user.role, "settings", "read");

  const canShowStats = canReadReservation || canReadInquiry || canReadSpace;
  const canShowRecent = canReadReservation || canReadInquiry;

  return (
    <div className="space-y-6">
      <DashboardHeader />

      {canShowStats ? (
        <Suspense fallback={<StatsCardsSkeleton />}>
          <DashboardStatsSection />
        </Suspense>
      ) : null}

      {canReadNotification ? (
        <Suspense fallback={<NotificationsSkeleton />}>
          <DashboardNotificationsSection />
        </Suspense>
      ) : null}

      {canReadReservation ? (
        <Suspense fallback={<ChartSkeleton />}>
          <DashboardChartSection />
        </Suspense>
      ) : null}

      {canReadSettings ? (
        <Suspense fallback={<AnalyticsSkeleton />}>
          <AnalyticsCard />
        </Suspense>
      ) : null}

      {canReadReservation ? (
        <Suspense fallback={<TodayReservationsSkeleton />}>
          <DashboardTodaySection />
        </Suspense>
      ) : null}

      {canShowRecent ? (
        <Suspense fallback={<RecentItemsSkeleton />}>
          <DashboardRecentSection />
        </Suspense>
      ) : null}
    </div>
  );
}
