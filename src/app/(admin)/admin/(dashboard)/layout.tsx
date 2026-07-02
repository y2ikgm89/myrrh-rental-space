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
import { connection } from "next/server";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AdminLayoutProvider } from "@/admin/contexts/admin-layout-context";
import { ConfirmProvider } from "@/admin/contexts/confirm-context";
import { NotificationPollingProvider } from "./_components/NotificationPollingProvider";
import { ResponsiveSidebar } from "./_components/ResponsiveSidebar";
import { DashboardShell } from "./_components/DashboardShell";
import { DashboardMain } from "./_components/DashboardMain";
import { TopBar } from "./_components/TopBar";
import { UserInfo, UserInfoSkeleton } from "./_components/UserInfo";
import type { ReactElement, ReactNode } from "react";
import { requireAdminDashboardAccess } from "@/admin/queries/_helpers";
import {
  filterSidebarGroupsByPermission,
  SIDEBAR_GROUPS,
} from "./_components/sidebar-items";
import { hasPermission } from "@/shared/lib/admin-permissions";
import {
  NotificationBellFallback,
  NotificationBellSlot,
  SearchTriggerSlot,
  TopBarBrandingFallback,
  TopBarBrandingSlot,
} from "./_components/TopBarSlots";
import { CommandPaletteProvider } from "./_shared/components/command-palette/CommandPaletteProvider";
import { CommandPalette } from "./_shared/components/command-palette/CommandPalette";
import { getNavItemsForRole } from "./_shared/lib/command-palette/nav-items";
import { getQuickActionsForRole } from "./_shared/lib/command-palette/quick-actions";
import { getRecentAuditedResources } from "@/shared/domain/audit/recents-queries";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  await connection();

  const user = await requireAdminDashboardAccess();
  const sidebarGroups = filterSidebarGroupsByPermission(
    SIDEBAR_GROUPS,
    (permission) =>
      hasPermission(user.role, permission.resource, permission.action),
  );

  const navItems = getNavItemsForRole(user.role);
  const quickActions = getQuickActionsForRole(user.role);
  const recents = await getRecentAuditedResources(user.id, user.role, 8);
  const canReadNotifications = hasPermission(user.role, "notification", "read");

  return (
    <AdminLayoutProvider>
      <NotificationPollingProvider enabled={canReadNotifications}>
        <ConfirmProvider>
          <NuqsAdapter>
            <CommandPaletteProvider
              navItems={navItems}
              quickActions={quickActions}
              recents={recents}
            >
              <div className="min-h-dvh bg-background">
                {/* レスポンシブサイドバー */}
                <ResponsiveSidebar
                  groups={sidebarGroups}
                  userInfo={
                    <Suspense fallback={<UserInfoSkeleton />}>
                      <UserInfo />
                    </Suspense>
                  }
                />

                {/* メインコンテンツエリア（composition: TopBar + Main） */}
                <DashboardShell>
                  <TopBar
                    branding={
                      <Suspense fallback={<TopBarBrandingFallback />}>
                        <TopBarBrandingSlot />
                      </Suspense>
                    }
                    notifications={
                      canReadNotifications ? (
                        <Suspense fallback={<NotificationBellFallback />}>
                          <NotificationBellSlot />
                        </Suspense>
                      ) : null
                    }
                    searchTrigger={<SearchTriggerSlot />}
                  />
                  <DashboardMain>{children}</DashboardMain>
                </DashboardShell>
                <CommandPalette />
              </div>
            </CommandPaletteProvider>
          </NuqsAdapter>
        </ConfirmProvider>
      </NotificationPollingProvider>
    </AdminLayoutProvider>
  );
}
