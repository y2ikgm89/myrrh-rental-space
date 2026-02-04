/**
 * [slug] — Dynamic page route (section-based rendering)
 *
 * Renders system pages (about, faq, privacy, terms, spaces) and custom pages
 * using DB-driven sections via SectionRenderer.
 *
 * /contact and /reservation have dedicated routes (Next.js routing priority).
 *
 * SEO: Dynamic metadata + BreadcrumbList JSON-LD
 */

import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { BreadcrumbJsonLd } from '@/public/components/seo/JsonLd'
import { generatePageMetadata } from '@/public/lib/page-metadata'
import {
  getPublicPage,
  getPageSections,
  getAllPublishedPageSlugs,
} from '@/public/actions/section'
import { ensurePageSections } from '@/shared/lib/section-defaults'
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

  // ensurePageSections は uncached DB 呼び出しのため connection() でオプトイン
  await connection()

  // ページデータ取得
  const page = await getPublicPage(slug)
  if (!page) {
    notFound()
  }

  // デフォルトセクションが未作成なら自動生成
  await ensurePageSections(page.id, slug)

  // セクション取得 & レンダリング
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
