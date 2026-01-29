/**
 * Aboutページ
 *
 * 企業・サービス紹介ページ。
 * セクションシステムでレンダリング。
 *
 * ## 構造化データ
 * - LocalBusiness JSON-LD
 * - Breadcrumb JSON-LD
 *
 * @module public/about/page
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LocalBusinessJsonLd, BreadcrumbJsonLd } from '@/public/components/seo/JsonLd'
import { getPublicBusinessSettings } from '@/shared/lib/settings'
import { generatePageMetadata } from '@/public/lib/page-metadata'
import { SITE_DEFAULTS } from '@/shared/lib/constants'
import { getPublicPageWithSections } from '@/public/actions/page-section'
import { PageSections } from '@/public/components/page-sections'
import { getPostUrlPrefix } from '@/shared/lib/settings/public'
import type { ReactElement } from 'react'

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata('about', {
    title: '私たちについて',
    description: `${SITE_DEFAULTS.name}は、ビジネスからプライベートまで、様々な用途に対応したレンタルスペースを提供しています。`,
  })
}

export default async function AboutPage(): Promise<ReactElement> {
  const [pageWithSections, postPrefix, settings] = await Promise.all([
    getPublicPageWithSections('about'),
    getPostUrlPrefix(),
    getPublicBusinessSettings(),
  ])

  if (!pageWithSections || pageWithSections.sections.length === 0) {
    notFound()
  }

  // 設定が取得できなかった場合はデフォルト値を使用
  const safeSettings = settings ?? {
    siteName: SITE_DEFAULTS.name,
    siteDescription: null,
    businessName: null,
    businessDescription: null,
    phoneNumber: null,
    email: null,
    address: null,
    streetAddress: null,
    city: null,
    prefecture: null,
    postalCode: null,
  }

  return (
    <>
      {/* JSON-LD構造化データ */}
      <LocalBusinessJsonLd
        name={safeSettings.businessName || safeSettings.siteName || SITE_DEFAULTS.name}
        description={safeSettings.businessDescription || safeSettings.siteDescription || undefined}
        telephone={safeSettings.phoneNumber || undefined}
        email={safeSettings.email || undefined}
        address={
          safeSettings.address
            ? {
                streetAddress: safeSettings.streetAddress || undefined,
                addressLocality: safeSettings.city || undefined,
                addressRegion: safeSettings.prefecture || undefined,
                postalCode: safeSettings.postalCode || undefined,
              }
            : undefined
        }
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', url: '/' },
          { name: pageWithSections.title || '私たちについて', url: '/about' },
        ]}
      />
      <PageSections sections={pageWithSections.sections} postPrefix={postPrefix} />
    </>
  )
}
