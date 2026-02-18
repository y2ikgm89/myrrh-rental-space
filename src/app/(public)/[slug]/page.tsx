/**
 * [slug] — Dynamic page route (section-based rendering)
 *
 * Renders custom pages using DB-driven sections via SectionRenderer.
 *
 * System pages have dedicated routes (Next.js routing priority):
 * /about, /contact, /faq, /news, /posts, /privacy, /reservation, /spaces, /terms
 *
 * This catch-all handles admin-created custom pages only.
 *
 * SEO: Dynamic metadata + BreadcrumbList JSON-LD
 */

import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { connection } from 'next/server'
import { notFound } from 'next/navigation'
import { BreadcrumbJsonLd } from '@/public/components/seo/JsonLd'
import { generatePageMetadata } from '@/public/lib/page-metadata'
import {
  getPublicPage,
  getPageSections,
} from '@/public/actions/section'
import { SectionRenderer } from '../_shared/components/sections/SectionRenderer'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await connection()

  const { slug } = await params
  return generatePageMetadata(slug)
}

export default async function DynamicPage({ params }: PageProps): Promise<ReactElement> {
  await connection()

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
