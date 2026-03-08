/**
 * /terms -- 利用規約ページ
 *
 * SEO: generatePageMetadata + BreadcrumbList JSON-LD
 * コンテンツ: DB セクション（HERO + CUSTOM）を SectionRenderer で描画
 */

import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { BreadcrumbJsonLd } from '@/public/components/seo/JsonLd'
import { generatePageMetadata } from '@/public/lib/page-metadata'
import { getPageSectionsWithFallback } from '@/shared/domain/sections/queries'
import { SectionRenderer } from '@/public/components/sections/SectionRenderer'

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata('terms')
}

export default async function TermsPage(): Promise<ReactElement> {
  const sections = await getPageSectionsWithFallback('terms')

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', url: '/' },
          { name: '利用規約', url: '/terms' },
        ]}
      />

      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  )
}
