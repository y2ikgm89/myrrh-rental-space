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
import { connection } from "next/server";
import { Header } from "@/public/components/layouts/site-header";
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
import {
  getHeaderNavigation,
  getMobileHeaderNavigation,
} from "@/shared/domain/navigation/queries";
import {
  getHeaderSettings,
  getFooterSettings,
} from "@/shared/domain/settings/queries/display";
import { HeaderBackgroundMode } from "@/shared/lib/validations/enums/prisma-types";
import {
  getAnalyticsConfig,
  getCookieConsentSettings,
  getSiteLayoutSettings,
} from "@/shared/domain/settings/queries/site";
import { getContainerSiteCss } from "@/shared/lib/styles/layout-mapper";
import { CSS_VAR } from "@/shared/lib/csp/css-vars";
import { NonceStyleBlock } from "@/shared/lib/csp/nonce-style";
import { StyleNonceRegistrar } from "@/shared/lib/csp/style-nonce-registrar";
import {
  buildDataStyleRule,
  DATA_STYLE_ID_ATTR,
} from "@/shared/lib/csp/sanitize-css";
import { MaintenanceGate } from "@/public/components/maintenance-gate";
import { getBaseUrl } from "@/shared/lib/constants";
import {
  getSeoSettings,
  resolveSiteBranding,
} from "@/public/lib/seo/metadata-factory";
import {
  resolveOpenGraphImages,
  resolveTwitterImages,
} from "@/public/lib/seo/default-social-images";
import { getPublicTaxSettings } from "@/shared/domain/settings/queries/tax";
import {
  TaxSettingsProvider,
  type PublicTaxDisplay,
} from "@/public/contexts/tax-settings";
import { skeletonKeys } from "@/shared/lib/skeleton-keys";
import { getFeedAlternates } from "@/public/lib/seo/feed-alternates";
import "./_styles/public.css";

const MAIN_SHELL_STYLE_ID = "main-shell";

/**
 * `<main>` chrome 全体の presentational frame（Server Component）。
 */
function MainShellFrame({
  styleId,
  isTransparent,
  taxValue,
  children,
}: {
  readonly styleId: string;
  readonly isTransparent: boolean;
  readonly taxValue: PublicTaxDisplay;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      {...{ [DATA_STYLE_ID_ATTR]: styleId }}
      className="flex-1 pb-[var(--spacing-fluid-md)] focus-visible:outline-none"
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

function MainShellFallback(): ReactElement {
  return (
    <div aria-hidden="true" className="flex-1 pb-[var(--spacing-fluid-md)]" />
  );
}

export async function generateMetadata(): Promise<Metadata> {
  // favicon は静的 URL `/icon` で `<link rel="icon">` を注入し、実体は dynamic icon
  // Route Handler (`src/app/icon/route.tsx`) が DB driven で配信する。favicon 部分は
  // 静的 literal のみで PR #699 が懸念した build-time prerender 汚染は発生しない。
  // `alternates` は posts feature module 状態に依存するため getFeedAlternates で
  // 動的解決する。`getFeedAlternates` は内部で `'use cache' + safeFetch` を持つ
  // `getFeatureModulesSettings` を呼ぶため、`await connection()` で runtime resume を
  // 強制しないと build 時 placeholder DATABASE_URL の fallback (posts OFF) が静的シェルに
  // 焼き込まれる (rule .claude/rules/caching.md `build prerender の焼き込み防止` 参照)。
  // 同 pattern: generateViewport の footerSettings.themeColor 解決 (下 121 行〜)。
  // posts OFF 時に `/feed.xml` が 404 を返す構造 (feed.xml/route.ts) と integrity 維持。
  // PWA manifest は公開 root metadata からだけ明示リンクし、IAP-protected admin root
  // では取得自体を発生させない。
  await connection();
  const [feedAlternates, seoSettings] = await Promise.all([
    getFeedAlternates(),
    getSeoSettings(),
  ]);
  const { siteName, description, ogTitle, ogDescription } =
    resolveSiteBranding(seoSettings);
  return {
    metadataBase: new URL(getBaseUrl()),
    title: {
      default: siteName,
      template: `%s | ${siteName}`,
    },
    description,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: "/icon",
      apple: "/apple-icon",
    },
    ...(feedAlternates !== null && { alternates: feedAlternates }),
    // OG / Twitter のサイト共通ベース。既定画像は Route Handler（Settings 駆動 alt）。
    openGraph: {
      type: "website",
      locale: "ja_JP",
      siteName,
      url: "/",
      title: ogTitle,
      description: ogDescription,
      images: resolveOpenGraphImages(siteName),
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: resolveTwitterImages(siteName),
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
  // rule .claude/rules/caching.md に従い `await connection()` で build prerender skip。
  await connection();
  const [cookieSettings, analyticsConfig, headersList] = await Promise.all([
    getCookieConsentSettings(),
    getAnalyticsConfig(),
    headers(),
  ]);

  const nonce = headersList.get("x-nonce");
  const cookieConsentEnabled = cookieSettings?.cookieConsentEnabled ?? false;

  return (
    <>
      <AnalyticsProvider
        config={analyticsConfig}
        nonce={nonce}
        cookieConsentEnabled={cookieConsentEnabled}
      />
      <WebVitalsReporter
        enabled={analyticsConfig.analyticsType !== null}
        cookieConsentEnabled={cookieConsentEnabled}
      />
      {cookieConsentEnabled && cookieSettings != null && (
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
 * Header ラッパー: DB からヘッダー設定 + ナビゲーションを取得
 *
 * 設計上の重要事項（build-time prerender 汚染の構造的回避）:
 * - `getHeaderSettings()` を **この Suspense 内 SC で fetch する**（layout 本体から
 *   props で渡さない）。layout 本体は静的シェルに焼き込まれるため、build 時に placeholder
 *   DATABASE_URL で接続失敗→safeFetch fallback の null が brand に焼かれる問題を回避する。
 * - `await connection()` で runtime 動的レンダリングを保証（`'use cache'` 関数だけだと
 *   Next.js が build prerender に焼き込んでしまうため）。
 * - auth chrome（login / mypage）はここへ埋め込まない。CDN blanket `public,s-maxage`
 *   が Cookie vary なしで HTML を共有するため、個人化 UI は Client Component が
 *   `/api/customer/auth-kind`（private, no-store）で hydrate 後に解決する。
 * - canonical: HeaderWithData / Footer / AnnouncementBarWrapper を Suspense + connection()
 *   で対称化することで、PPR の static shell は skeleton のみ、実データは runtime resume。
 */
async function HeaderWithData(): Promise<ReactElement> {
  await connection();
  const [headerSettings, navItems, mobileNavItems] = await Promise.all([
    getHeaderSettings(),
    getHeaderNavigation(),
    getMobileHeaderNavigation(),
  ]);

  return (
    <Header
      brand={headerSettings.brand}
      navItems={navItems}
      mobileNavItems={mobileNavItems}
      scrollBehavior={headerSettings.scrollBehavior}
      backgroundMode={headerSettings.backgroundMode}
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
  const shellCss = buildDataStyleRule(MAIN_SHELL_STYLE_ID, {
    [CSS_VAR.containerSite]: getContainerSiteCss(layoutSettings),
    ...(isTransparent && {
      marginTop: "calc(var(--header-height, 0px) * -1)",
    }),
  });

  return (
    <>
      <NonceStyleBlock id={MAIN_SHELL_STYLE_ID} css={shellCss} />
      <MainShellFrame
        styleId={MAIN_SHELL_STYLE_ID}
        isTransparent={isTransparent}
        taxValue={taxValue}
      >
        {children}
      </MainShellFrame>
    </>
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
          {/* Radix の scroll lock が注入する <style> に per-request nonce を渡す。
              headers() を読むので Suspense 内に置く（詳細は RegisterStyleNonce の JSDoc）。 */}
          <Suspense fallback={null}>
            <StyleNonceRegistrar />
          </Suspense>
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
                {/* Auth kind は MobileNav 内で hydrate 後 fetch（CDN HTML に埋め込まない） */}
                <MobileNav />

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
