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
import { ResponsiveSidebar } from "./_components/ResponsiveSidebar";
import { MainContent } from "./_components/MainContent";
import { TopBar } from "./_components/TopBar";
import { UserInfo, UserInfoSkeleton } from "./_components/UserInfo";
import { getAdminBrandingSettings } from "@/shared/domain/settings/queries/organization";
import type { ReactElement, ReactNode } from "react";
import { requireAdminDashboardAccess } from "@/admin/queries/_helpers";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  await headers();
  await requireAdminDashboardAccess();
  const brandingSettings = await getAdminBrandingSettings();

  return (
    <AdminLayoutProvider>
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
                />
              }
            >
              {children}
            </MainContent>
          </div>
        </NuqsAdapter>
      </ConfirmProvider>
    </AdminLayoutProvider>
  );
}
