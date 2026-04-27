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
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AdminLayoutProvider } from "@/admin/contexts/admin-layout-context";
import { ConfirmProvider } from "@/admin/contexts/confirm-context";
import { NotificationPollingProvider } from "./_components/NotificationPollingProvider";
import { ResponsiveSidebar } from "./_components/ResponsiveSidebar";
import { MainContent } from "./_components/MainContent";
import { TopBar } from "./_components/TopBar";
import { UserInfo, UserInfoSkeleton } from "./_components/UserInfo";
import type { ReactElement, ReactNode } from "react";
import { requireAdminDashboardAccess } from "@/admin/queries/_helpers";
import {
  filterSidebarItemsByPermission,
  SIDEBAR_ITEMS,
} from "./_components/sidebar-items";
import { hasPermission } from "@/admin/lib/permissions";
import {
  NotificationBellFallback,
  NotificationBellSlot,
  SearchTriggerSlot,
  TopBarBrandingFallback,
  TopBarBrandingSlot,
} from "./_components/TopBarSlots";
import {
  TopBarUserBadge,
  TopBarUserBadgeFallback,
} from "./_components/TopBarUserBadge";
import { CommandPaletteProvider } from "./_shared/components/command-palette/CommandPaletteProvider";
import { CommandPalette } from "./_shared/components/command-palette/CommandPalette";
import type {
  NavItem,
  QuickAction,
  RecentItem,
} from "./_shared/components/command-palette/types";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  const user = await requireAdminDashboardAccess();
  const sidebarItems = filterSidebarItemsByPermission(
    SIDEBAR_ITEMS,
    (permission) =>
      hasPermission(user.role, permission.resource, permission.action),
  );

  // Bundle B 完了後に置換: getNavItemsForRole(user.role) 等を呼ぶ
  const navItems: NavItem[] = [];
  const quickActions: QuickAction[] = [];
  const recents: RecentItem[] = [];

  return (
    <AdminLayoutProvider>
      <NotificationPollingProvider>
        <ConfirmProvider>
          <NuqsAdapter>
            <CommandPaletteProvider
              navItems={navItems}
              quickActions={quickActions}
              recents={recents}
            >
              <div className="min-h-screen bg-background">
                {/* レスポンシブサイドバー */}
                <ResponsiveSidebar
                  items={sidebarItems}
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
                      branding={
                        <Suspense fallback={<TopBarBrandingFallback />}>
                          <TopBarBrandingSlot />
                        </Suspense>
                      }
                      notifications={
                        <Suspense fallback={<NotificationBellFallback />}>
                          <NotificationBellSlot />
                        </Suspense>
                      }
                      userBadge={
                        <Suspense fallback={<TopBarUserBadgeFallback />}>
                          <TopBarUserBadge />
                        </Suspense>
                      }
                      searchTrigger={<SearchTriggerSlot />}
                    />
                  }
                >
                  {children}
                </MainContent>
                <CommandPalette />
              </div>
            </CommandPaletteProvider>
          </NuqsAdapter>
        </ConfirmProvider>
      </NotificationPollingProvider>
    </AdminLayoutProvider>
  );
}
