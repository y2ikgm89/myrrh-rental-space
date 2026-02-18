/**
 * /spaces -- スペース一覧ページ
 *
 * SEO: generatePageMetadata + BreadcrumbList JSON-LD
 * コンテンツ: DB セクション（HERO + SPACE_LIST）を SectionRenderer で描画
 */

import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { connection } from 'next/server'
import { BreadcrumbJsonLd } from '@/public/components/seo/JsonLd'
import { generatePageMetadata } from '@/public/lib/page-metadata'
import { getPageSectionsWithFallback } from '@/public/actions/section'
import { SectionRenderer } from '@/public/components/sections/SectionRenderer'

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata('spaces')
}

export default async function SpacesPage(): Promise<ReactElement> {
  await connection()

  const sections = await getPageSectionsWithFallback('spaces')

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', url: '/' },
          { name: 'スペース一覧', url: '/spaces' },
        ]}
      />

      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  )
}
