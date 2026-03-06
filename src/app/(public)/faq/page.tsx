/**
 * /faq -- よくある質問ページ
 *
 * SEO: generatePageMetadata + BreadcrumbList JSON-LD + FAQPage JSON-LD
 * コンテンツ: DB セクション（HERO + FAQ_LIST + CTA）を SectionRenderer で描画
 *
 * NOTE: FAQPage JSON-LD uses dangerouslySetInnerHTML for schema.org structured data.
 * The content is admin-managed via Lexical editor and stored as sanitized HTML in DB.
 */

import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { connection } from 'next/server'
import { BreadcrumbJsonLd } from '@/public/components/seo/JsonLd'
import { generatePageMetadata } from '@/public/lib/page-metadata'
import { getPageSectionsWithFallback, getPublishedFaqItems } from '@/public/actions/section'
import { SectionRenderer } from '@/public/components/sections/SectionRenderer'

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata('faq')
}

export default async function FaqPage(): Promise<ReactElement> {
  await connection()

  const [sections, items] = await Promise.all([
    getPageSectionsWithFallback('faq'),
    getPublishedFaqItems(50),
  ])

  // Strip HTML tags for plain text in JSON-LD Answer
  // Content is admin-managed via Lexical editor and stored as sanitized HTML in DB.
  // JSON.stringify escapes all special characters, making this safe for JSON-LD output.
  const faqJsonLd = items.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: (item.answerHtml ?? '').replace(/<[^>]*>/g, ''),
          },
        })),
      }
    : null

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', url: '/' },
          { name: 'よくある質問', url: '/faq' },
        ]}
      />

      {/* FAQPage JSON-LD -- sanitized via JSON.stringify (no raw HTML in output) */}
      {/* eslint-disable @eslint-react/dom/no-dangerously-set-innerhtml -- JSON-LD: JSON.stringify-encoded, no raw HTML */}
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}

      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  )
}
