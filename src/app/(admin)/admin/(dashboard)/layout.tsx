/**
 * ダッシュボードレイアウト
 *
 * レスポンシブ対応:
 * - デスクトップ (>= 1024px): 固定サイドバー
 * - モバイル/タブレット: ドロワー形式
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: サイドバー、ヘッダー構造
 * - 動的コンテンツ: 認証情報（Suspenseでラップ）
 *
 */

import { Suspense } from "react";
import { headers } from "next/headers";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AdminLayoutProvider } from "@/admin/contexts/admin-layout-context";
import { ConfirmProvider } from "@/admin/contexts/confirm-context";
import { NotificationPollingProvider } from "./_components/NotificationPollingProvider";
import { ResponsiveSidebar } from "./_components/ResponsiveSidebar";
import { MainContent } from "./_components/MainContent";
import { TopBar } from "./_components/TopBar";
import { UserInfo, UserInfoSkeleton } from "./_components/UserInfo";
import { getAdminBrandingSettings } from "@/shared/domain/settings/queries/organization";
import type { ReactElement, ReactNode } from "react";
import { requireAdminDashboardAccess } from "@/admin/queries/_helpers";
import {
  getUnreadNotificationCount,
  getRecentNotifications,
} from "@/admin/queries/notification";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  await headers();
  await requireAdminDashboardAccess();
  const [brandingSettings, unreadCount, recentNotifications] =
    await Promise.all([
      getAdminBrandingSettings(),
      getUnreadNotificationCount(),
      getRecentNotifications(),
    ]);

  return (
    <AdminLayoutProvider>
      <NotificationPollingProvider initialCount={unreadCount}>
        <ConfirmProvider>
          <NuqsAdapter>
            <div className="min-h-screen bg-background">
              {/* レスポンシブサイドバー */}
              <ResponsiveSidebar
                userInfo={
                  <Suspense fallback={<UserInfoSkeleton />}>
                    <UserInfo />
                  </Suspense>
                }
              />

              {/* メインコンテンツエリア */}
              <MainContent
                topBar={
                  <TopBar
                    siteName={brandingSettings.siteName}
                    headerLogoUrl={brandingSettings.headerLogoUrl}
                    useHeaderLogo={brandingSettings.useHeaderLogo}
                    recentNotifications={recentNotifications.map((n) => ({
                      ...n,
                      createdAt: n.createdAt.toISOString(),
                    }))}
                  />
                }
              >
                {children}
              </MainContent>
            </div>
          </NuqsAdapter>
        </ConfirmProvider>
      </NotificationPollingProvider>
    </AdminLayoutProvider>
  );
}
