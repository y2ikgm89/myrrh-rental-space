/**
 * お問い合わせページ
 *
 * セクションシステムでレンダリング。
 *
 * ## 構造化データ
 * - Breadcrumb JSON-LD
 *
 * @module public/contact/page
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
  return generatePageMetadata('contact', {
    title: 'お問い合わせ',
    description:
      'レンタルスペースに関するお問い合わせはこちらから。ご質問・ご予約のご相談など、お気軽にお問い合わせください。',
  })
}

export default async function ContactPage(): Promise<ReactElement> {
  const [pageWithSections, postPrefix] = await Promise.all([
    getPublicPageWithSections('contact'),
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
          { name: pageWithSections.title || 'お問い合わせ', url: '/contact' },
        ]}
      />
      <PageSections sections={pageWithSections.sections} postPrefix={postPrefix} />
    </>
  )
}
