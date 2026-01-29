/**
 * プライバシーポリシーページ
 *
 * セクションシステムでレンダリング。
 *
 * ## 構造化データ
 * - Breadcrumb JSON-LD
 *
 * @module public/privacy/page
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
  return generatePageMetadata('privacy', {
    title: 'プライバシーポリシー',
    description: '個人情報の取り扱いについてご確認ください。',
  })
}

export default async function PrivacyPolicyPage(): Promise<ReactElement> {
  const [pageWithSections, postPrefix] = await Promise.all([
    getPublicPageWithSections('privacy'),
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
          { name: pageWithSections.title || 'プライバシーポリシー', url: '/privacy' },
        ]}
      />
      <PageSections sections={pageWithSections.sections} postPrefix={postPrefix} />
    </>
  )
}
