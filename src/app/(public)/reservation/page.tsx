/**
 * 予約ページ
 *
 * セクションシステムでレンダリング。
 *
 * ## 構造化データ
 * - Breadcrumb JSON-LD
 *
 * @module public/reservation/page
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BreadcrumbJsonLd } from '@/public/components/seo/JsonLd'
import { generatePageMetadata } from '@/public/lib/page-metadata'
import { getPublicPageWithSections } from '@/public/actions/page-section'
import { PageSections } from '@/public/components/page-sections'
import { getPostUrlPrefix } from '@/shared/lib/settings/public'
import type { ReactElement } from 'react'

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata('reservation', {
    title: '予約',
    description: 'レンタルスペースのご予約はこちらから。日時を選択して、簡単にご予約いただけます。',
  })
}

export default async function ReservationPage(): Promise<ReactElement> {
  const [pageWithSections, postPrefix] = await Promise.all([
    getPublicPageWithSections('reservation'),
    getPostUrlPrefix(),
  ])

  if (!pageWithSections || pageWithSections.sections.length === 0) {
    notFound()
  }

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', url: '/' },
          { name: pageWithSections.title || '予約', url: '/reservation' },
        ]}
      />
      <PageSections sections={pageWithSections.sections} postPrefix={postPrefix} />
    </>
  )
}
