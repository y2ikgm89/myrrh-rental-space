/**
 * Contact Page — Contact form + business info
 *
 * SEO: Dynamic metadata via unified pipeline
 */

import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { Suspense } from 'react'
import { ScrollReveal } from '@/public/components/animations/ScrollReveal'
import { BreadcrumbJsonLd } from '@/public/components/seo/JsonLd'
import { generatePageMetadata } from '@/public/lib/page-metadata'
import { ContactHero } from './_components/ContactHero'
import { ContactForm } from './_components/ContactForm'
import { BusinessInfo } from './_components/BusinessInfo'

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata('contact')
}

export default function ContactPage(): ReactElement {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', url: '/' },
          { name: 'お問い合わせ', url: '/contact' },
        ]}
      />
      <ContactHero />
      <section className="pb-24 md:pb-32">
        <div className="mx-auto max-w-4xl px-5 md:px-8">
          <div className="grid gap-10 md:grid-cols-[1fr_320px] md:gap-12">
            {/* Form */}
            <ContactForm />

            {/* Business Info — Server Component with DB data */}
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
