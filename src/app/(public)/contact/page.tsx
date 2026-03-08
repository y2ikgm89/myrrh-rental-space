/**
 * /contact — お問い合わせページ
 *
 * パターンB: セクション + カスタムコンテンツ
 * セクション（Hero等）をレンダー後、フォーム + ビジネス情報を配置
 *
 * SEO: generatePageMetadata + BreadcrumbList JSON-LD
 */

import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { Suspense } from 'react'
import { ScrollReveal } from '@/public/components/animations/ScrollReveal'
import { BreadcrumbJsonLd } from '@/public/components/seo/JsonLd'
import { generatePageMetadata } from '@/public/lib/page-metadata'
import { getPageSectionsWithFallback } from '@/shared/domain/sections/queries'
import { SectionRenderer } from '@/public/components/sections/SectionRenderer'
import { ContactForm } from './_components/ContactForm'
import { BusinessInfo } from './_components/BusinessInfo'

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata('contact')
}

export default async function ContactPage(): Promise<ReactElement> {
  const sections = await getPageSectionsWithFallback('contact')

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', url: '/' },
          { name: 'お問い合わせ', url: '/contact' },
        ]}
      />

      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}

      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-4xl px-5 md:px-8">
          <div className="grid gap-10 md:grid-cols-[1fr_320px] md:gap-12">
            <ContactForm />
            <ScrollReveal delay={0.2}>
              <Suspense fallback={null}>
                <BusinessInfo />
              </Suspense>
            </ScrollReveal>
          </div>
        </div>
      </section>
    </>
  )
}
