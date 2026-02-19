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
import { connection } from "next/server";
import { cacheLife, cacheTag } from "next/cache";
import { CACHE_TAGS, CACHE_LIFE } from "@/shared/lib/constants";
import { AdminLayoutProvider } from "@/admin/contexts/admin-layout-context";
import { ConfirmProvider } from "@/admin/contexts/confirm-context";
import { ResponsiveSidebar } from "./_components/ResponsiveSidebar";
import { MainContent } from "./_components/MainContent";
import { TopBar } from "./_components/TopBar";
import { UserInfo, UserInfoSkeleton } from "./_components/UserInfo";
import { prisma } from "@/shared/lib/prisma";
import { serverEnv } from "@/shared/lib/env/server";
import type { ReactElement, ReactNode } from "react";

const ADMIN_LOGIN_TOKEN = serverEnv.ADMIN_LOGIN_TOKEN ?? "";

async function getAdminBrandingSettings() {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.SETTINGS);

  const settings = await prisma.settings.findFirst({
    select: {
      siteName: true,
      headerLogoUrl: true,
      useHeaderLogo: true,
    },
  });

  return {
    siteName: settings?.siteName ?? null,
    headerLogoUrl: settings?.headerLogoUrl ?? null,
    useHeaderLogo: settings?.useHeaderLogo ?? true,
  };
}

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  // Access dynamic data (headers) early to mark this route as dynamic for Next.js 16 PPR
  // This allows Server Actions in child components to use new Date() without errors
  await headers();

  await connection();

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
                token={ADMIN_LOGIN_TOKEN}
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
