/**
 * 公開ページ用レイアウト
 *
 * ヘッダー・フッター・Analytics・Cookie同意バナー・お知らせバーを含むレイアウト
 * GDPR対応: Cookie同意後のみAnalyticsを有効化
 */

import { Header } from '@/components/layouts/Header'
import { Footer } from '@/components/layouts/Footer'
import { AnalyticsProvider } from '@/components/analytics'
import { CookieConsentBanner } from '@/components/site/CookieConsentBanner'
import { AnnouncementBarWrapper } from '@/components/site/AnnouncementBarWrapper'
import { prisma } from '@/lib/prisma'
import { getAnalyticsConfig } from '@/lib/analytics/config'
import type { ReactElement, ReactNode } from 'react'

// 動的レンダリングを強制（ビルド時のDB接続不要）
export const dynamic = 'force-dynamic'

async function getCookieConsentSettings() {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
      select: {
        cookieConsentEnabled: true,
        cookieConsentMessage: true,
        cookieConsentAcceptText: true,
        cookieConsentRejectText: true,
        cookieConsentPolicyUrl: true,
      },
    })
    return settings
  } catch {
    return null
  }
}

export default async function PublicLayout({
  children,
}: {
  children: ReactNode
}): Promise<ReactElement> {
  const [cookieSettings, analyticsConfig] = await Promise.all([
    getCookieConsentSettings(),
    getAnalyticsConfig(),
  ])

  return (
    <div className="flex min-h-screen flex-col">
      <AnnouncementBarWrapper />
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <AnalyticsProvider config={analyticsConfig} />
      {cookieSettings?.cookieConsentEnabled && (
        <CookieConsentBanner
          message={cookieSettings.cookieConsentMessage}
          acceptText={cookieSettings.cookieConsentAcceptText}
          rejectText={cookieSettings.cookieConsentRejectText}
          policyUrl={cookieSettings.cookieConsentPolicyUrl}
        />
      )}
    </div>
  )
}
