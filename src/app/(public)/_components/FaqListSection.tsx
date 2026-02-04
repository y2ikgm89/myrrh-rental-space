'use client'

/**
 * FaqListSection — FAQ accordion with details/summary
 *
 * Zero JS accessibility via native <details>/<summary>.
 * Variant: default (bordered +/-), bordered (card shadow), minimal (separator line).
 * Optional FAQ JSON-LD for schema.org FAQPage.
 */

import { useRef, type ReactElement } from 'react'
import Link from 'next/link'
import { useGSAP } from '@gsap/react'
import { gsap } from '@/public/lib/gsap-config'
import { ScrollReveal } from '@/public/components/animations/ScrollReveal'
import { SplitText } from '@/public/components/animations/SplitText'
import { SectionLabel } from '@/public/components/ui/SectionLabel'
import { DURATION, EASE, STAGGER } from '@/public/lib/animations'
import type { FaqListConfig } from '@/shared/lib/validations/section'

export interface FaqData {
  readonly id: string
  readonly question: string
  readonly answer: string
}

interface FaqListSectionProps {
  readonly config: FaqListConfig
  readonly items: readonly FaqData[]
}

const VARIANT_STYLES = {
  default: {
    container: 'divide-y divide-border',
    item: 'py-4 first:pt-0 last:pb-0',
    summary: 'flex w-full cursor-pointer items-center justify-between gap-4 text-left font-heading text-base font-medium md:text-lg [&::marker]:content-none [&::-webkit-details-marker]:hidden',
    marker: true,
  },
  bordered: {
    container: 'space-y-3',
    item: 'rounded-lg border border-border bg-card p-4 shadow-sm',
    summary: 'flex w-full cursor-pointer items-center justify-between gap-4 text-left font-heading text-base font-medium md:text-lg [&::marker]:content-none [&::-webkit-details-marker]:hidden',
    marker: true,
  },
  minimal: {
    container: 'divide-y divide-border/50',
    item: 'py-4 first:pt-0 last:pb-0',
    summary: 'flex w-full cursor-pointer items-center justify-between gap-4 text-left text-sm font-medium md:text-base [&::marker]:content-none [&::-webkit-details-marker]:hidden',
    marker: false,
  },
} as const

export function FaqListSection({ config, items }: FaqListSectionProps): ReactElement {
  const listRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const list = listRef.current
      if (!list) return

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const faqItems = list.querySelectorAll('[data-faq-item]')
        if (faqItems.length === 0) return

        gsap.fromTo(
          faqItems,
          { y: 20, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: DURATION.normal,
            ease: EASE.outQuart,
            stagger: STAGGER.element * 0.6,
            scrollTrigger: {
              trigger: list,
              start: 'top 80%',
              toggleActions: 'play none none none',
            },
          },
        )
      })
    },
    { scope: listRef },
  )

  if (items.length === 0) return <></>

  const styles = VARIANT_STYLES[config.variant] ?? VARIANT_STYLES.default

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-5 md:px-8">
        <div className="mb-10 text-center md:mb-14">
          <ScrollReveal>
            <SectionLabel>FAQ</SectionLabel>
          </ScrollReveal>
          <h2 className="mt-4 font-heading text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl">
            <SplitText variant="words">
              {config.title}
            </SplitText>
          </h2>
        </div>

        <div ref={listRef} className={styles.container}>
          {items.map((item) => (
            <details key={item.id} data-faq-item="" className={`group ${styles.item}`}>
              <summary className={styles.summary}>
                <span>{item.question}</span>
                {styles.marker && (
                  <span className="shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45" aria-hidden="true">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                    </svg>
                  </span>
                )}
              </summary>
              <div
                className="mt-3 text-sm leading-relaxed text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: item.answer }}
              />
            </details>
          ))}
        </div>

        {config.showViewAllLink && (
          <ScrollReveal delay={0.2}>
            <div className="mt-8 text-center">
              <Link
                href="/faq"
                className="group relative inline-block text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-primary-dark"
              >
                全てのFAQ &rarr;
                <span className="absolute bottom-0 left-0 h-px w-0 bg-primary-dark/60 transition-all duration-300 group-hover:w-full" />
              </Link>
            </div>
          </ScrollReveal>
        )}
      </div>

      {/* FAQ JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: items.map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: item.answer.replace(/<[^>]*>/g, ''),
              },
            })),
          }),
        }}
      />
    </section>
  )
}
