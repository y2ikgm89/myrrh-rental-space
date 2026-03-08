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
import { AdminLayoutProvider } from "@/admin/contexts/admin-layout-context";
import { ConfirmProvider } from "@/admin/contexts/confirm-context";
import { ResponsiveSidebar } from "./_components/ResponsiveSidebar";
import { MainContent } from "./_components/MainContent";
import { TopBar } from "./_components/TopBar";
import { UserInfo, UserInfoSkeleton } from "./_components/UserInfo";
import { getAdminBrandingSettings } from "@/shared/domain/settings/queries";
import type { ReactElement, ReactNode } from "react";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  const brandingSettings = await getAdminBrandingSettings();

  return (
    <AdminLayoutProvider>
      <ConfirmProvider>
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
      </ConfirmProvider>
    </AdminLayoutProvider>
  );
}
