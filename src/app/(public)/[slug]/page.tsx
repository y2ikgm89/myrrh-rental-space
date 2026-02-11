/**
 * [slug] — Dynamic page route (section-based rendering)
 *
 * Renders system pages (about, faq, privacy, terms, spaces) and custom pages
 * using DB-driven sections via SectionRenderer.
 *
 * /contact and /reservation have dedicated routes (Next.js routing priority).
 *
 * Section initialization is handled by admin ensureSystemPage or seed,
 * not by public page rendering (read-only).
 *
 * SEO: Dynamic metadata + BreadcrumbList JSON-LD
 */

import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { notFound } from 'next/navigation'
import { BreadcrumbJsonLd } from '@/public/components/seo/JsonLd'
import { generatePageMetadata } from '@/public/lib/page-metadata'
import {
  getPublicPage,
  getPageSections,
  getAllPublishedPageSlugs,
} from '@/public/actions/section'
import { SectionRenderer } from '../_shared/components/sections/SectionRenderer'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  return generatePageMetadata(slug)
}

export async function generateStaticParams() {
  const slugs = await getAllPublishedPageSlugs()
  return slugs.map((slug) => ({ slug }))
}

export default async function DynamicPage({ params }: PageProps): Promise<ReactElement> {
  const { slug } = await params

  const page = await getPublicPage(slug)
  if (!page) {
    notFound()
  }

  const sections = await getPageSections(page.id)

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', url: '/' },
          { name: page.title, url: `/${slug}` },
        ]}
      />
      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  )
}
