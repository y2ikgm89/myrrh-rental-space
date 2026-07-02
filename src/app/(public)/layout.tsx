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
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { Suspense } from "react";
import { headers } from "next/headers";
import { connection } from "next/server";
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
} from "@/shared/domain/settings/queries/display";
import { HeaderBackgroundMode } from "@/shared/lib/validations/enums/prisma-types";
import {
  getCookieConsentSettings,
  getSiteLayoutSettings,
  FALLBACK_LAYOUT_CONFIG,
} from "@/shared/domain/settings/queries/site";
import { getContainerSiteCss } from "@/shared/lib/styles/layout-mapper";
import { MaintenanceGate } from "@/public/components/maintenance-gate";
import { getAnalyticsConfig } from "@/shared/lib/analytics/config";
import { getBaseUrl, SITE_DEFAULTS } from "@/shared/lib/constants";
import { getPublicTaxSettings } from "@/shared/domain/settings/queries/tax";
import {
  TaxSettingsProvider,
  type PublicTaxDisplay,
} from "@/public/contexts/tax-settings";
import { skeletonKeys } from "@/shared/lib/skeleton-keys";
import "./_styles/public.css";

type MainShellStyle = CSSProperties & {
  readonly "--container-site": string;
};

export async function generateMetadata(): Promise<Metadata> {
  // favicon は静的 URL `/icon` で `<link rel="icon">` を注入し、実体は dynamic icon
  // Route Handler (`src/app/icon/route.tsx`) が DB driven で配信する。generateMetadata
  // 自体は静的 literal のみ返し DB query しないため、PR #699 が懸念した build-time
  // prerender 汚染は構造的に発生しない。PWA manifest は公開 root metadata からだけ
  // 明示リンクし、IAP-protected admin root では取得自体を発生させない。
  return {
    metadataBase: new URL(getBaseUrl()),
    title: {
      default: SITE_DEFAULTS.name,
      template: `%s | ${SITE_DEFAULTS.name}`,
    },
    description: SITE_DEFAULTS.description,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: "/icon",
      apple: "/apple-icon",
    },
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
}

// nonce CSP(strict-dynamic) + PPR(cacheComponents) では route を完全動的(ƒ)に
// しないと document 直下の framework/chunk スクリプトに per-request nonce が付かず
// CSP で全ブロックされる（◐ 静的シェルでは nonce 不在＝公開サイトの JS が一切起動しない）。
// Next.js 16 公式 next-prerender-dynamic-viewport opt-in pattern:
// generateViewport で dynamic API (connection/cookies/headers) を await し、
// `<html>` を `<Suspense>` で包む → route 全体が ƒ 化 / framework script に nonce 注入。
// 公式: https://nextjs.org/docs/app/api-reference/functions/generate-viewport
// admin PR #604 / project_admin-auth-csp-nonce-connection-2026-06-16 と同型。
export async function generateViewport(): Promise<Viewport> {
  await connection();
  const footerSettings = await getFooterSettings();
  return {
    width: "device-width",
    initialScale: 1,
    // edge-to-edge（ノッチ/ホームインジケータ下まで描画）。各 fixed/edge 要素は
    // env(safe-area-inset-*) でセーフエリアを避ける（非ノッチ端末では inset=0 で無変化）。
    viewportFit: "cover",
    interactiveWidget: "resizes-visual",
    // "only light" で Chrome Auto Dark Theme / Samsung 強制ダークの自動反転を
    // opt-out（"light" 単独では止まらない）。OKLCH ライト配色の機械反転を防止。
    colorScheme: "only light",
    themeColor: footerSettings.themeColor,
  };
}

/**
 * 動的コンテンツ: Cookie同意バナーとAnalytics
 * リクエスト時に評価される
 */
async function DynamicContent(): Promise<ReactElement> {
  // `getCookieConsentSettings` / `getAnalyticsConfig` は `'use cache' + safeFetch` 構造のため、
  // rule .claude/rules/db-and-domain.md §6 に従い `await connection()` で build prerender skip。
  await connection();
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
 *
 * `await connection()` 必須（defense-in-depth）: `getAnalyticsConfig()` は内部で
 * `'use cache' + safeFetch fallback (defaults)` 構造のため、Suspense ラップだけだと
 * build prerender 経路で eager 評価される。現状は GA OFF 同士で結果一致で実害ゼロだが、
 * admin が GA / Bing / Search Console を有効化した瞬間に静的シェルが OFF を恒久 baking
 * する構造的同型違反になる。`connection()` で runtime resume を強制し予防。
 *
 * Resource hint (`<link rel="preconnect">` / dns-prefetch) は emit しない:
 * - W3C / web.dev 公式: preconnect は実際にその origin へリクエストするとわかっている
 *   page でだけ emit すべき。blanket emit は Lighthouse の "unused preconnect" 警告原因。
 * - 本サイトの外部 origin 直接フェッチ箇所:
 *   - R2 mp4 video (`<video src={r2-url}>`) → `video-player.tsx` で render 時に preconnect
 *   - R2 SVG ロゴ (`<Image unoptimized>`) → `site-brand.tsx` で render 時に preconnect
 *   - Cloudflare Turnstile (iframe) → `turnstile-widget.tsx` で render 時に preconnect
 *   全て React 19 公式 `react-dom` preconnect API で consumer 側 emit、`<link>` は
 *   React 19 の metadata hoisting で自動 `<head>` 移動。
 * - 通常 R2 画像は `/_next/image` 経由（Next.js Image Optimizer がサーバー側で R2 取得・
 *   `next-server.ts` の `fetchExternalImage`）でブラウザは R2 へ直接接続しないため preconnect 無効。
 * - Stripe は公開フローで未使用、YouTube/Vimeo/Maps iframe は lazy load で below-fold、
 *   Analytics は cookie consent 後の遅延ロードのため全て preconnect 対象外。
 */
async function HeadContent(): Promise<ReactElement> {
  await connection();
  const config = await getAnalyticsConfig();

  return (
    <>
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
 *
 * `await connection()` 必須: 内部の `getOrganizationSettings()` は
 * `'use cache' + safeFetch({fallback: null})` のため、Suspense ラップだけでは
 * build prerender 経路で eager 評価され、placeholder DATABASE_URL で null fallback が
 * 静的シェルに永続 baking される（businessName/phoneNumber/address 等が SITE_DEFAULTS
 * + localhost:3000 に collapse して全公開 route の JSON-LD に焼き込まれる）。SEO への
 * 直接影響あり。`connection()` で runtime resume を強制し、Cloud Run 実 DB から resolve。
 */
async function StructuredDataContent(): Promise<ReactElement> {
  await connection();
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
 * Header ラッパー: DB からヘッダー設定 + ナビゲーション + 認証状態を取得
 *
 * 設計上の重要事項（build-time prerender 汚染の構造的回避）:
 * - `getHeaderSettings()` を **この Suspense 内 SC で fetch する**（layout 本体から
 *   props で渡さない）。layout 本体は静的シェルに焼き込まれるため、build 時に placeholder
 *   DATABASE_URL で接続失敗→safeFetch fallback の null が brand に焼かれる問題を回避する。
 * - `await connection()` で runtime 動的レンダリングを保証（`'use cache'` 関数だけだと
 *   Next.js が build prerender に焼き込んでしまうため）。
 * - canonical: HeaderWithData / Footer / AnnouncementBarWrapper を Suspense + connection()
 *   で対称化することで、PPR の static shell は skeleton のみ、実データは runtime resume。
 */
async function HeaderWithData(): Promise<ReactElement> {
  await connection();
  const [headerSettings, navItems, authKind] = await Promise.all([
    getHeaderSettings(),
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

/**
 * `<main>` chrome 全体の presentational frame（Server Component）。
 *
 * 取得した settings は props 経由で渡す。データ取得は `MainShellResolved`（async）が担う。
 */
function MainShellFrame({
  style,
  isTransparent,
  taxValue,
  children,
}: {
  readonly style: CSSProperties;
  readonly isTransparent: boolean;
  readonly taxValue: PublicTaxDisplay;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex-1 pb-[var(--spacing-fluid-md)] focus-visible:outline-none"
      style={style}
      {...(isTransparent && { "data-header-transparent": "" })}
    >
      <TaxSettingsProvider value={taxValue}>
        <LenisProvider>
          <NuqsAdapter>{children}</NuqsAdapter>
        </LenisProvider>
      </TaxSettingsProvider>
    </main>
  );
}

// Suspense fallback is a decorative spacer only, so it stays DB-independent.
const DEFAULT_MAIN_STYLE: MainShellStyle = {
  "--container-site": getContainerSiteCss(FALLBACK_LAYOUT_CONFIG),
};

function MainShellFallback(): ReactElement {
  return (
    <div
      aria-hidden="true"
      className="flex-1 pb-[var(--spacing-fluid-md)]"
      style={DEFAULT_MAIN_STYLE}
    />
  );
}

/**
 * `<main>` の動的 chrome を解決する async Server Component（Suspense 内で resume）。
 *
 * 設計（PR #76c2316b で確立した build-time prerender 汚染回避 pattern の layout 本体への展開）:
 * - `await connection()` で build prerender を skip して runtime に評価
 * - 'use cache' + safeFetch fallback の null が静的シェル RSC payload に焼き込まれる構造的問題を回避
 * - fallback は装飾 skeleton / spacer のみ。page children と landmark は resolved 側だけで
 *   描画し、React streaming 中の duplicate landmark / hydration mismatch を避ける。
 */
async function MainShellResolved({
  children,
}: {
  readonly children: ReactNode;
}): Promise<ReactElement> {
  await connection();
  const [headerSettings, taxSettings, layoutSettings] = await Promise.all([
    getHeaderSettings(),
    getPublicTaxSettings(),
    getSiteLayoutSettings(),
  ]);
  const isTransparent =
    headerSettings.backgroundMode === HeaderBackgroundMode.transparent;
  const taxValue: PublicTaxDisplay = {
    standardRate: taxSettings.standardRate,
    reducedRate: taxSettings.reducedRate,
    displayMode: taxSettings.displayModePublic,
  };
  const style: MainShellStyle = {
    "--container-site": getContainerSiteCss(layoutSettings),
    ...(isTransparent && {
      marginTop: "calc(var(--header-height, 0px) * -1)",
    }),
  };

  return (
    <MainShellFrame
      style={style}
      isTransparent={isTransparent}
      taxValue={taxValue}
    >
      {children}
    </MainShellFrame>
  );
}

export default async function PublicRootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>): Promise<ReactElement> {
  // layout 本体では DB query を直配置で呼ばない（build prerender で safeFetch fallback の
  // null/[] が静的シェルに永続 baking される構造的問題を回避）。
  // - `<main>` chrome に必要な settings → MainShellResolved (Suspense + connection)
  // - maintenance mode 判定 → MaintenanceGate (Suspense + connection)
  // SSoT: memory `project_cacheable-fetch-build-prerender-canonical-2026-06-22`。
  //
  // `<html>` を `<Suspense>` で包むのは Next.js 16 公式 next-prerender-dynamic-viewport
  // opt-in pattern: generateViewport の `await connection()` と合わせて route を ƒ 化し、
  // PPR 静的シェルを emit させない → strict-dynamic CSP nonce が framework script 全てに付与。
  // 公式: https://nextjs.org/docs/app/api-reference/functions/generate-viewport
  // 同 pattern: admin layout (PR #604 / project_admin-auth-csp-nonce-connection-2026-06-16)。

  return (
    <Suspense>
      <html lang="ja" data-scroll-behavior="smooth">
        <head>
          <Suspense fallback={null}>
            <HeadContent />
          </Suspense>
        </head>
        <body className="font-sans antialiased">
          {/* MaintenanceGate: 内部で `await connection()` + `getMaintenanceSettings()`。
              maintenance ON → MaintenancePage を直接 return（chrome 全部スキップ）。
              maintenance OFF → children（通常 chrome）を pass-through。
              `'use cache' + safeFetch` を持つ getMaintenanceSettings を rule §6 通り隔離。 */}
          <MaintenanceGate>
            {/* 全公開ページ共通の構造化データ */}
            <Suspense fallback={null}>
              <StructuredDataContent />
            </Suspense>
            <AriaLiveProvider>
              <div className="flex min-h-dvh flex-col pb-16 md:pb-0">
                {/* アクセシビリティ: スキップリンク（初回Tabで表示） */}
                <SkipLink />

                {/* AnnouncementBarWrapper も Suspense + connection() で build-time prerender に
                    焼かれないようにする。bar が active で無ければ component が null を返すため、
                    fallback は null (skeleton 不要)。 */}
                <Suspense fallback={null}>
                  <AnnouncementBarWrapper />
                </Suspense>
                <Suspense
                  fallback={
                    <div
                      aria-hidden="true"
                      className="flex h-[var(--header-height,4rem)] items-center border-b border-border/50 px-[var(--container-padding)]"
                    >
                      <div className="h-5 w-24 animate-pulse bg-surface" />
                      <div className="ml-auto hidden gap-6 md:flex">
                        {skeletonKeys(4, "nav-item").map((key) => (
                          <div
                            key={key}
                            className="h-3 w-14 animate-pulse bg-surface"
                          />
                        ))}
                      </div>
                    </div>
                  }
                >
                  <HeaderWithData />
                </Suspense>

                {/* `<main>` chrome を Suspense + await connection() で隔離。Footer/Header/
                    AnnouncementBar と同 pattern (PR #76c2316b) を layout 本体にも展開し、
                    build prerender で null fallback が静的シェルに焼き込まれる構造を排除。
                    fallback は装飾 spacer のみにして duplicate landmark を避ける。 */}
                <Suspense fallback={<MainShellFallback />}>
                  <MainShellResolved>{children}</MainShellResolved>
                </Suspense>

                {/* Footer は Suspense でラップして build-time prerender への焼き込みを回避。
                    内部の `await connection()` で runtime 動的化を保証。実データは resume で流入。 */}
                <Suspense
                  fallback={
                    <div
                      aria-hidden="true"
                      className="border-t border-border bg-surface"
                    >
                      <div className="mx-auto max-w-6xl px-5 py-[var(--spacing-fluid-sm)] md:px-8 md:py-[var(--spacing-fluid-md)]">
                        <div className="grid gap-10 md:gap-16 md:grid-cols-3">
                          {skeletonKeys(3, "footer-col").map((key) => (
                            <div key={key} className="space-y-3">
                              <div className="h-3 w-20 animate-pulse bg-surface" />
                              <div className="h-3 w-32 animate-pulse bg-surface" />
                              <div className="h-3 w-24 animate-pulse bg-surface" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  }
                >
                  <Footer />
                </Suspense>
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
          </MaintenanceGate>
        </body>
      </html>
    </Suspense>
  );
}
