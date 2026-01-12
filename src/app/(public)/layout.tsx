/**
 * 公開ページ用レイアウト
 *
 * ヘッダー・フッター・Analytics・Cookie同意バナー・お知らせバーを含むレイアウト
 * GDPR対応: Cookie同意後のみAnalyticsを有効化
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: Header, Footer (use cache でキャッシュ)
 * - 動的コンテンツ: CookieConsentBanner, Analytics (Suspense でラップ)
 */

import { Suspense } from 'react'
import { Header } from '@/components/layouts/Header'
import { Footer } from '@/components/layouts/Footer'
import { AnalyticsProvider } from '@/components/analytics'
import { CookieConsentBanner } from '@/components/site/CookieConsentBanner'
import { AnnouncementBarWrapper } from '@/components/site/AnnouncementBarWrapper'
import { getCookieConsentSettings } from '@/lib/settings'
import { getAnalyticsConfig } from '@/lib/analytics/config'
import type { ReactElement, ReactNode } from 'react'

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

export default async function PublicLayout({
  children,
}: {
  children: ReactNode
}): Promise<ReactElement> {
  return (
    <div className="flex min-h-screen flex-col">
      {/* キャッシュされたコンテンツ - 静的シェルに含まれる */}
      <AnnouncementBarWrapper />
      <Header />

      <main className="flex-1">{children}</main>

      <Footer />

      {/* 動的コンテンツ - リクエスト時にストリーミング */}
      <Suspense fallback={null}>
        <DynamicContent />
      </Suspense>
    </div>
  )
}
