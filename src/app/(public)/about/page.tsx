/**
 * /about -- 私たちについてページ
 *
 * SEO: generatePageMetadata + BreadcrumbList JSON-LD
 * コンテンツ: DB セクション（HERO + CUSTOM + CTA）を SectionRenderer で描画
 */

import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { BreadcrumbJsonLd } from '@/public/components/seo/JsonLd'
import { generatePageMetadata } from '@/public/lib/page-metadata'
import { getPageSectionsWithFallback } from '@/shared/domain/sections/queries'
import { SectionRenderer } from '@/public/components/sections/SectionRenderer'

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata('about')
}

export default async function AboutPage(): Promise<ReactElement> {
  const sections = await getPageSectionsWithFallback('about')

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', url: '/' },
          { name: '私たちについて', url: '/about' },
        ]}
      />

      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  )
}
