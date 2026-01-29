/**
 * スペース一覧ページ
 *
 * セクションシステムでレンダリング。
 *
 * ## 構造化データ
 * - Breadcrumb JSON-LD
 *
 * @module public/spaces/page
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
  return generatePageMetadata('spaces', {
    title: 'スペース一覧',
    description: 'ご利用可能なレンタルスペースの一覧です。',
  })
}

export default async function SpacesPage(): Promise<ReactElement> {
  const [pageWithSections, postPrefix] = await Promise.all([
    getPublicPageWithSections('spaces'),
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
          { name: pageWithSections.title || 'スペース一覧', url: '/spaces' },
        ]}
      />
      <PageSections sections={pageWithSections.sections} postPrefix={postPrefix} />
    </>
  )
}
