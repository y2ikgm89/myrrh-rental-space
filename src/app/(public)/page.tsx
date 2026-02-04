/**
 * Homepage — DB-driven section rendering
 *
 * Fetches sections from DB via getHomepageSections() and renders
 * each through HomepageSectionRenderer.
 *
 * SEO: Dynamic metadata + WebSite JSON-LD
 */

import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { WebSiteJsonLd } from '@/public/components/seo/JsonLd'
import { getWebSiteJsonLdData, getSeoSettings } from '@/public/lib/seo'
import { SITE_DEFAULTS, getBaseUrl } from '@/shared/lib/constants'
import { getHomepageSections } from '@/public/actions/section'
import { HomepageSectionRenderer } from './_shared/components/sections/HomepageSectionRenderer'

const BASE_URL = getBaseUrl()

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSeoSettings()

  const siteName = settings?.siteName ?? SITE_DEFAULTS.name
  const description =
    settings?.defaultOgpDescription ??
    settings?.defaultMetaDescription ??
    settings?.siteDescription ??
    SITE_DEFAULTS.description
  const title = settings?.defaultOgpTitle ?? siteName
  const image = settings?.defaultOgpImageUrl ?? `${BASE_URL}/og-image.png`

  return {
    title: siteName,
    description,
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/`,
      siteName,
      images: [{ url: image }],
      type: 'website',
      locale: 'ja_JP',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
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
      {sections.map((section) => (
        <HomepageSectionRenderer key={section.id} section={section} />
      ))}
    </>
  )
}
