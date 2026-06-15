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
import {
  Header,
  type HeaderAuthSlot,
} from "@/public/components/layouts/site-header";
import { Footer } from "@/public/components/layouts/site-footer";
import {
  AnalyticsProvider,
  WebVitalsReporter,
} from "@/public/components/analytics";
import { CookieConsentBanner } from "@/public/components/cookie-consent-banner";
import { AnnouncementBarWrapper } from "@/public/components/announcement-bar-wrapper";
import { SkipLink } from "@/public/components/a11y/skip-link";
import { AriaLiveRegion } from "@/public/components/a11y/aria-live-region";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AriaLiveProvider } from "@/shared/contexts";
import { LenisProvider } from "@/public/components/providers/lenis-provider";
import { MobileNav } from "@/public/components/layouts/mobile-nav";
import { GraphJsonLd } from "@/public/components/seo/json-ld";
import { getGraphJsonLdData } from "@/public/lib/seo";
import { getHeaderNavigation } from "@/shared/domain/navigation/queries";
import { getCurrentCustomerUser } from "@/shared/lib/customer-auth";
import { Role } from "@/shared/lib/validations/enums/prisma-types";
import {
  getHeaderSettings,
  getFooterSettings,
  type HeaderSettings,
} from "@/shared/domain/settings/queries/display";
import { HeaderBackgroundMode } from "@/shared/lib/validations/enums/prisma-types";
import {
  getCookieConsentSettings,
  getMaintenanceSettings,
} from "@/shared/domain/settings/queries/site";
import { MaintenancePage } from "@/public/components/maintenance-page";
import { getAnalyticsConfig } from "@/shared/lib/analytics/config";
import { getBaseUrl, SITE_DEFAULTS } from "@/shared/lib/constants";
import { getPublicTaxSettings } from "@/shared/domain/settings/queries/tax";
import { TaxSettingsProvider } from "@/public/contexts/tax-settings";
import { skeletonKeys } from "@/shared/lib/skeleton-keys";
import "./_styles/public.css";

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: {
    default: SITE_DEFAULTS.name,
    template: `%s | ${SITE_DEFAULTS.name}`,
  },
  description: SITE_DEFAULTS.description,
  alternates: {
    types: {
      "application/rss+xml": "/feed.xml",
    },
  },
  // OG / Twitter のサイト共通ベース。画像は file-based opengraph-image / twitter-image
  // が自動注入する。各ページの generateMetadata が openGraph を export すると
  // shallow 置換されるため、siteName / locale 等はページ側でも明示する必要がある。
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: SITE_DEFAULTS.name,
    url: "/",
    title: SITE_DEFAULTS.name,
    description: SITE_DEFAULTS.description,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_DEFAULTS.name,
    description: SITE_DEFAULTS.description,
  },
};

export async function generateViewport(): Promise<Viewport> {
  const footerSettings = await getFooterSettings();
  return {
    width: "device-width",
    initialScale: 1,
    interactiveWidget: "resizes-visual",
    colorScheme: "light",
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
 * 構造化データ: @graph パターン（Organization + WebSite）
 * エンティティ間の @id 相互参照でナレッジグラフ理解を向上
 */
async function StructuredDataContent(): Promise<ReactElement> {
  const graphData = await getGraphJsonLdData();
  return (
    <GraphJsonLd
      organization={graphData.organization}
      webSite={graphData.webSite}
    />
  );
}

/**
 * 公開ページで共有する認証状態
 * - CUSTOMER / USER ロール → mypage
 * - 未認証 → login
 * - 管理ロール → null（モバイルナビ・ヘッダーでは非表示）
 */
type PublicAuthKind = "mypage" | "login" | null;

async function resolvePublicAuthKind(): Promise<PublicAuthKind> {
  const user = await getCurrentCustomerUser();
  if (!user) return "login";
  if (user.role === Role.CUSTOMER || user.role === Role.USER) return "mypage";
  return null;
}

/**
 * Header ラッパー: DB からナビゲーション + 認証状態を取得
 *
 * ブランド（サイト名・ロゴ・ロゴ使用フラグ）は `headerSettings.brand` に
 * Settings から既にロード済みのため、ここでは追加フェッチ不要。
 *
 * PPR: `getCurrentCustomerUser()` は uncached なため、この async SC は必ず
 * 親レイアウトの `<Suspense>` 内で呼び出すこと。
 */
async function HeaderWithData({
  headerSettings,
}: {
  headerSettings: HeaderSettings;
}): Promise<ReactElement> {
  const [navItems, authKind] = await Promise.all([
    getHeaderNavigation(),
    resolvePublicAuthKind(),
  ]);

  const authSlot: HeaderAuthSlot | null =
    authKind === "mypage"
      ? {
          variant: "authenticated",
          mypageHref: "/mypage",
          mypageLabel: "マイページ",
        }
      : authKind === "login"
        ? { variant: "guest", loginHref: "/login", loginLabel: "ログイン" }
        : null;

  return (
    <Header
      brand={headerSettings.brand}
      navItems={navItems}
      scrollBehavior={headerSettings.scrollBehavior}
      backgroundMode={headerSettings.backgroundMode}
      authSlot={authSlot}
    />
  );
}

/**
 * MobileNav ラッパー: 認証状態を取得して Client Component に渡す
 * `<Suspense>` 内で呼び出すこと。`getCurrentCustomerUser()` は request 単位で
 * `cache()` メモ化されているため HeaderWithData との重複 DB アクセスは発生しない。
 */
async function MobileNavWithAuth(): Promise<ReactElement> {
  const authKind = await resolvePublicAuthKind();
  return <MobileNav authKind={authKind} />;
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
        <body className="font-sans antialiased">
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
      <body className="font-sans antialiased">
        {/* 全公開ページ共通の構造化データ */}
        <Suspense fallback={null}>
          <StructuredDataContent />
        </Suspense>
        <AriaLiveProvider>
          <div className="flex min-h-dvh flex-col pb-16 md:pb-0">
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
                    {skeletonKeys(4, "nav-item").map((key) => (
                      <div
                        key={key}
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
            <Suspense fallback={null}>
              <MobileNavWithAuth />
            </Suspense>

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
