/**
 * 公開ページ Root IconLayout
 *
 * Next.js 16 Multiple Root Layouts パターン
 * - 管理画面とは完全に分離された独立したRoot IconLayout
 * - public.css で公開ページ専用テーマを適用
 * - 公開ページ ↔ 管理画面の遷移はフルページリロード（仕様）
 *
 * アクセシビリティ対応:
 * - スキップリンク: キーボードナビゲーション改善
 * - ARIAライブリージョン: スクリーンリーダー向け動的通知
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: Header, Footer (use cache でキャッシュ)
 * - 動的コンテンツ: CookieConsentBanner, Analytics (Suspense でラップ)
 */

import type { Metadata, Viewport } from "next";
import type { ReactElement, ReactNode } from "react";
import { Suspense } from "react";
import { headers } from "next/headers";
import { Cormorant_Garamond, Noto_Sans_JP } from "next/font/google";
import { Header } from "@/public/components/layouts/site-header";
import { Footer } from "@/public/components/layouts/site-footer";
import {
  AnalyticsProvider,
  WebVitalsReporter,
} from "@/public/components/analytics";
import { CookieConsentBanner } from "@/public/components/cookie-consent-banner";
import { AnnouncementBarWrapper } from "@/public/components/announcement-bar-wrapper";
import { SkipLink, AriaLiveRegion } from "@/public/components/a11y";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AriaLiveProvider } from "@/shared/contexts";
import { LenisProvider } from "@/public/components/providers/lenis-provider";
import { MobileNav } from "@/public/components/layouts/mobile-nav";
import { GraphJsonLd } from "@/public/components/seo/json-ld";
import { getGraphJsonLdData } from "@/public/lib/seo";
import { getHeaderNavigation } from "@/shared/domain/navigation/queries";
import { getBusinessInfo } from "@/public/data/business";
import { getCurrentCustomerUser } from "@/shared/lib/customer-auth";
import { Role } from "@generated/prisma/enums";
import {
  getHeaderSettings,
  getFooterSettings,
  type HeaderSettings,
} from "@/shared/domain/settings/queries/display";
import { HeaderBackgroundMode } from "@generated/prisma/enums";
import {
  getCookieConsentSettings,
  getMaintenanceSettings,
} from "@/shared/domain/settings/queries/site";
import { MaintenancePage } from "@/public/components/maintenance-page";
import { getAnalyticsConfig } from "@/shared/lib/analytics/config";
import { SITE_DEFAULTS } from "@/shared/lib/constants";
import { clientEnv } from "@/shared/lib/env/client";
import { getPublicTaxSettings } from "@/shared/domain/settings/queries/tax";
import { TaxSettingsProvider } from "@/public/contexts/tax-settings";
import { cn } from "@/shared/lib/cn";
import "./_styles/public.css";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant-garamond",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: SITE_DEFAULTS.name,
    template: `%s | ${SITE_DEFAULTS.name}`,
  },
  description: SITE_DEFAULTS.description,
};

export async function generateViewport(): Promise<Viewport> {
  const footerSettings = await getFooterSettings();
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: footerSettings.themeColor,
  };
}

/**
 * 動的コンテンツ: Cookie同意バナーとAnalytics
 * リクエスト時に評価される
 */
async function DynamicContent(): Promise<ReactElement> {
  const [cookieSettings, analyticsConfig, headersList] = await Promise.all([
    getCookieConsentSettings(),
    getAnalyticsConfig(),
    headers(),
  ]);

  const nonce = headersList.get("x-nonce");

  return (
    <>
      <AnalyticsProvider config={analyticsConfig} nonce={nonce} />
      <WebVitalsReporter enabled={analyticsConfig.analyticsType !== null} />
      {cookieSettings?.cookieConsentEnabled && (
        <CookieConsentBanner
          message={cookieSettings.cookieConsentMessage}
          acceptText={cookieSettings.cookieConsentAcceptText}
          rejectText={cookieSettings.cookieConsentRejectText}
          policyUrl={cookieSettings.cookieConsentPolicyUrl}
        />
      )}
    </>
  );
}

/**
 * Head内の動的コンテンツ: Analytics設定による検索エンジン検証タグ
 */
async function HeadContent(): Promise<ReactElement> {
  const config = await getAnalyticsConfig();

  return (
    <>
      {/* Preconnect hints for external resources */}
      {clientEnv.NEXT_PUBLIC_SUPABASE_URL && (
        <link
          rel="preconnect"
          href={new URL(clientEnv.NEXT_PUBLIC_SUPABASE_URL).origin}
          crossOrigin="anonymous"
        />
      )}
      <link rel="dns-prefetch" href="https://challenges.cloudflare.com" />
      <link rel="dns-prefetch" href="https://js.stripe.com" />

      {/* Google Search Console verification */}
      {config.googleSearchConsoleId && (
        <meta
          name="google-site-verification"
          content={config.googleSearchConsoleId}
        />
      )}
      {/* Bing Webmaster Tools verification */}
      {config.bingWebmasterToolsId && (
        <meta name="msvalidate.01" content={config.bingWebmasterToolsId} />
      )}
    </>
  );
}

/**
 * 構造化データ: @graph パターン（LocalBusiness + WebSite）
 * エンティティ間の @id 相互参照でナレッジグラフ理解を向上
 */
async function StructuredDataContent(): Promise<ReactElement> {
  const graphData = await getGraphJsonLdData();
  return <GraphJsonLd {...graphData} />;
}

/**
 * Header ラッパー: DB からナビゲーション + ブランド名を取得して Client Component に渡す
 */
async function HeaderWithData({
  headerSettings,
}: {
  headerSettings: HeaderSettings;
}): Promise<ReactElement> {
  const [navItems, businessInfo, currentUser] = await Promise.all([
    getHeaderNavigation(),
    getBusinessInfo(),
    getCurrentCustomerUser(),
  ]);

  const isCustomer =
    currentUser?.role === Role.CUSTOMER || currentUser?.role === Role.USER;
  const authLink =
    currentUser && isCustomer
      ? { href: "/mypage", label: "マイページ" }
      : currentUser
        ? undefined
        : { href: "/login", label: "ログイン" };

  const headerProps = {
    brandName: businessInfo.name.split(" ")[0]?.toUpperCase() ?? "MYRRH",
    scrollBehavior: headerSettings.scrollBehavior,
    backgroundMode: headerSettings.backgroundMode,
    ...(navItems.length > 0 ? { navItems } : {}),
    ...(authLink ? { authLink } : {}),
  };

  return <Header {...headerProps} />;
}

export default async function PublicRootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>): Promise<ReactElement> {
  // メンテナンスモードチェック: 有効時は通常レイアウトをスキップして専用画面を返す
  const maintenanceSettings = await getMaintenanceSettings();
  if (maintenanceSettings.maintenanceMode) {
    return (
      <html lang="ja">
        <body
          className={cn(
            notoSansJP.variable,
            cormorantGaramond.variable,
            "font-sans antialiased",
          )}
        >
          <MaintenancePage message={maintenanceSettings.maintenanceMessage} />
        </body>
      </html>
    );
  }

  const [headerSettings, taxSettings] = await Promise.all([
    getHeaderSettings(),
    getPublicTaxSettings(),
  ]);
  const isTransparent =
    headerSettings.backgroundMode === HeaderBackgroundMode.transparent;
  const publicTaxDisplay = {
    standardRate: taxSettings.standardRate,
    reducedRate: taxSettings.reducedRate,
    displayMode: taxSettings.displayModePublic,
  };

  return (
    <html lang="ja">
      <head>
        <Suspense fallback={null}>
          <HeadContent />
        </Suspense>
      </head>
      <body
        className={cn(
          notoSansJP.variable,
          cormorantGaramond.variable,
          "font-sans antialiased",
        )}
      >
        {/* 全公開ページ共通の構造化データ */}
        <Suspense fallback={null}>
          <StructuredDataContent />
        </Suspense>
        <AriaLiveProvider>
          <div className="flex min-h-screen flex-col pb-16 md:pb-0">
            {/* アクセシビリティ: スキップリンク（初回Tabで表示） */}
            <SkipLink />

            {/* キャッシュされたコンテンツ - 静的シェルに含まれる */}
            <AnnouncementBarWrapper />
            <Suspense
              fallback={
                <header
                  role="banner"
                  className="flex h-[var(--header-height,4rem)] items-center border-b border-border/50 px-[var(--container-padding)]"
                >
                  <div className="h-5 w-24 animate-pulse bg-surface" />
                  <nav className="ml-auto hidden gap-6 md:flex">
                    {Array.from({ length: 4 }, (_, i) => (
                      <div
                        key={i}
                        className="h-3 w-14 animate-pulse bg-surface"
                      />
                    ))}
                  </nav>
                </header>
              }
            >
              <HeaderWithData headerSettings={headerSettings} />
            </Suspense>

            <main
              id="main-content"
              className="flex-1"
              {...(isTransparent && {
                "data-header-transparent": "",
                style: {
                  marginTop: "calc(var(--header-height, 0px) * -1)",
                },
              })}
            >
              <TaxSettingsProvider value={publicTaxDisplay}>
                <LenisProvider>
                  <NuqsAdapter>{children}</NuqsAdapter>
                </LenisProvider>
              </TaxSettingsProvider>
            </main>

            <Footer />
            <MobileNav />

            {/* 動的コンテンツ - リクエスト時にストリーミング */}
            <Suspense fallback={null}>
              <DynamicContent />
            </Suspense>

            {/* アクセシビリティ: スクリーンリーダー向け通知領域 */}
            <AriaLiveRegion />
          </div>
        </AriaLiveProvider>
      </body>
    </html>
  );
}
