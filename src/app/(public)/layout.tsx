/**
 * 公開ページ Root Layout
 *
 * Next.js 16 Multiple Root Layouts パターン
 * - 管理画面とは完全に分離された独立したRoot Layout
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

import type { Metadata, Viewport } from 'next'
import type { ReactElement, ReactNode } from 'react'
import { Suspense } from 'react'
import { connection } from 'next/server'
import { Noto_Sans_JP, Noto_Serif_JP } from 'next/font/google'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { Header } from '@/public/components/layouts/Header'
import { Footer } from '@/public/components/layouts/Footer'
import { AnalyticsProvider, WebVitalsReporter } from '@/public/components/analytics'
import { CookieConsentBanner } from '@/public/components/CookieConsentBanner'
import { AnnouncementBarWrapper } from '@/public/components/AnnouncementBarWrapper'
import { SkipLink, AriaLiveRegion } from '@/public/components/a11y'
import { AriaLiveProvider } from '@/shared/contexts'
import { SmoothScrollProvider } from '@/public/components/providers/SmoothScrollProvider'
import {
  ScrollOrchestratorProvider,
  VisualEffectsProvider,
  PerformanceMonitor,
} from '@/public/components/effects/core'
import { GraphJsonLd } from '@/public/components/seo/JsonLd'
import { getGraphJsonLdData } from '@/public/lib/seo'
import { getHeaderNavigation } from '@/public/lib/navigation'
import { getBusinessInfo } from '@/public/data/business'
import { getHeaderSettings } from '@/public/lib/header-settings'
import type { HeaderSettings } from '@/public/lib/header-settings'
import { HeaderBackgroundMode } from '@/shared/generated/prisma/enums'
import { getCookieConsentSettings } from '@/shared/lib/settings'
import { getAnalyticsConfig } from '@/shared/lib/analytics/config'
import { SITE_DEFAULTS } from '@/shared/lib/constants'
import { clientEnv } from '@/shared/lib/env/client'
import './_styles/public.css'

const notoSansJP = Noto_Sans_JP({
  variable: '--font-noto-sans-jp',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
})

const notoSerifJP = Noto_Serif_JP({
  variable: '--font-noto-serif-jp',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
})

export const metadata: Metadata = {
  title: {
    default: SITE_DEFAULTS.name,
    template: `%s | ${SITE_DEFAULTS.name}`,
  },
  description: SITE_DEFAULTS.description,
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#fafafa',
}

/**
 * 動的コンテンツ: Cookie同意バナーとAnalytics
 * リクエスト時に評価される
 */
async function DynamicContent(): Promise<ReactElement> {
  const [cookieSettings, analyticsConfig] = await Promise.all([
    getCookieConsentSettings(),
    getAnalyticsConfig(),
  ])

  return (
    <>
      <AnalyticsProvider config={analyticsConfig} />
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
  )
}

/**
 * Head内の動的コンテンツ: Analytics設定による検索エンジン検証タグ
 */
async function HeadContent(): Promise<ReactElement> {
  const config = await getAnalyticsConfig()

  return (
    <>
      {/* Preconnect hints for external resources */}
      <link
        rel="preconnect"
        href={new URL(clientEnv.NEXT_PUBLIC_SUPABASE_URL).origin}
        crossOrigin="anonymous"
      />
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
  )
}

/**
 * 構造化データ: @graph パターン（LocalBusiness + WebSite）
 * エンティティ間の @id 相互参照でナレッジグラフ理解を向上
 */
async function StructuredDataContent(): Promise<ReactElement> {
  const graphData = await getGraphJsonLdData()
  return <GraphJsonLd {...graphData} />
}

/**
 * Header ラッパー: DB からナビゲーション + ブランド名を取得して Client Component に渡す
 */
async function HeaderWithData({ headerSettings }: { headerSettings: HeaderSettings }): Promise<ReactElement> {
  const [navItems, businessInfo] = await Promise.all([
    getHeaderNavigation(),
    getBusinessInfo(),
  ])

  return (
    <Header
      brandName={businessInfo.name.split(' ')[0]?.toUpperCase() ?? 'MYRRH'}
      navItems={navItems.length > 0 ? navItems : undefined}
      scrollBehavior={headerSettings.scrollBehavior}
      backgroundMode={headerSettings.backgroundMode}
    />
  )
}

export default async function PublicRootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>): Promise<ReactElement> {
  await connection()

  const headerSettings = await getHeaderSettings()
  const isTransparent = headerSettings.backgroundMode === HeaderBackgroundMode.transparent

  return (
    <html lang="ja">
      <head>
        <Suspense fallback={null}>
          <HeadContent />
        </Suspense>
      </head>
      <body className={`${notoSansJP.variable} ${notoSerifJP.variable} font-sans antialiased`}>
        {/* 全公開ページ共通の構造化データ */}
        <Suspense fallback={null}>
          <StructuredDataContent />
        </Suspense>
        <SmoothScrollProvider>
        <ScrollOrchestratorProvider>
        <VisualEffectsProvider>
        {/* NuqsAdapter は内部で useSearchParams を使用するため Suspense でラップ（Next.js 16 PPR対応） */}
        <Suspense fallback={null}>
          <NuqsAdapter>
            <AriaLiveProvider>
            <div className="flex min-h-screen flex-col">
              {/* アクセシビリティ: スキップリンク（初回Tabで表示） */}
              <SkipLink />

              {/* キャッシュされたコンテンツ - 静的シェルに含まれる */}
              <AnnouncementBarWrapper />
              <Suspense fallback={null}>
                <HeaderWithData headerSettings={headerSettings} />
              </Suspense>

              <main
                id="main-content"
                className="flex-1"
                {...(isTransparent && {
                  'data-header-transparent': '',
                  style: { marginTop: 'calc(var(--header-height, 0px) * -1)' },
                })}
              >
                {children}
              </main>

              <Footer />

              {/* 動的コンテンツ - リクエスト時にストリーミング */}
              <Suspense fallback={null}>
                <DynamicContent />
              </Suspense>

              {/* アクセシビリティ: スクリーンリーダー向け通知領域 */}
              <AriaLiveRegion />
            </div>
          </AriaLiveProvider>
          </NuqsAdapter>
        </Suspense>
        <PerformanceMonitor />
        </VisualEffectsProvider>
        </ScrollOrchestratorProvider>
        </SmoothScrollProvider>
      </body>
    </html>
  )
}
