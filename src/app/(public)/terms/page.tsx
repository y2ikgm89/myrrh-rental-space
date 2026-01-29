/**
 * 利用規約ページ
 *
 * セクションシステムでレンダリング。
 *
 * ## 構造化データ
 * - Breadcrumb JSON-LD
 *
 * @module public/terms/page
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
  return generatePageMetadata('terms', {
    title: '利用規約',
    description: 'レンタルスペースの利用規約をご確認ください。',
  })
}

export default async function TermsOfServicePage(): Promise<ReactElement> {
  const [pageWithSections, postPrefix] = await Promise.all([
    getPublicPageWithSections('terms'),
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
          { name: pageWithSections.title || '利用規約', url: '/terms' },
        ]}
      />
      <PageSections sections={pageWithSections.sections} postPrefix={postPrefix} />
    </>
  )
}
