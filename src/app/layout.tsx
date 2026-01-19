import type { Metadata } from 'next'
import type { ReactElement, ReactNode } from 'react'
import { Noto_Sans_JP } from 'next/font/google'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { getAnalyticsConfig } from '@/public/lib/analytics/config'
import { SITE_DEFAULTS } from '@/shared/lib/constants'
import './globals.css'

const notoSansJP = Noto_Sans_JP({
  variable: '--font-noto-sans-jp',
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

// Analytics設定は 'use cache' ディレクティブでキャッシュされるため、静的レンダリングが可能
// 設定変更時はrevalidateTag('analytics-config')で無効化される

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>): Promise<ReactElement> {
  const config = await getAnalyticsConfig()

  return (
    <html lang="ja">
      <head>
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
      </head>
      <body className={`${notoSansJP.variable} font-sans antialiased`}>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  )
}
