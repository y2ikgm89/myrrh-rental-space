/**
 * Homepage — DB-driven section rendering
 *
 * Fetches sections from DB via getHomepageSections() and renders
 * each through SectionRenderer.
 *
 * Section initialization is handled by seed or admin UI,
 * not by public page rendering (read-only).
 *
 * SEO: Dynamic metadata via unified pipeline + WebSite JSON-LD
 */

import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { ExperienceShell } from '@/public/components/effects/ExperienceShell'
import { WebSiteJsonLd } from '@/public/components/seo/JsonLd'
import { getWebSiteJsonLdData } from '@/public/lib/seo'
import { generatePageMetadata } from '@/public/lib/page-metadata'
import { getHomepageSections } from '@/shared/domain/sections/queries'
import { SectionRenderer } from './_shared/components/sections/SectionRenderer'

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata('home')
}

export default async function HomePage(): Promise<ReactElement> {
  const [webSiteData, sections] = await Promise.all([
    getWebSiteJsonLdData(),
    getHomepageSections(),
  ])

  return (
    <>
      <WebSiteJsonLd
        name={webSiteData.name}
        description={webSiteData.description}
        url={webSiteData.url}
      />
      <ExperienceShell>
        {sections.map((section) => (
          <SectionRenderer key={section.id} section={section} />
        ))}
      </ExperienceShell>
    </>
  )
}
