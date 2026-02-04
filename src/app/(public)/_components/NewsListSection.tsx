'use client'

/**
 * NewsListSection — News article listing with list/card layout
 *
 * List layout: date badge + title row. Card layout: 2-column card grid.
 * useGSAP stagger for entrance animation.
 */

import { useRef, type ReactElement } from 'react'
import Link from 'next/link'
import { useGSAP } from '@gsap/react'
import { gsap } from '@/public/lib/gsap-config'
import { ScrollReveal } from '@/public/components/animations/ScrollReveal'
import { SplitText } from '@/public/components/animations/SplitText'
import { SectionLabel } from '@/public/components/ui/SectionLabel'
import { DURATION, EASE, STAGGER } from '@/public/lib/animations'
import type { NewsListConfig } from '@/shared/lib/validations/section'

export interface NewsData {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly publishedAt: Date | null
}

interface NewsListSectionProps {
  readonly config: NewsListConfig
  readonly news: readonly NewsData[]
}

function formatDate(date: Date | null): string {
  if (!date) return ''
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(date))
    .replaceAll('/', '.')
}

export function NewsListSection({ config, news }: NewsListSectionProps): ReactElement {
  const listRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const list = listRef.current
      if (!list) return

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const items = list.querySelectorAll('[data-news-item]')
        if (items.length === 0) return

        gsap.fromTo(
          items,
          { y: 30, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: DURATION.slow,
            ease: EASE.outQuart,
            stagger: STAGGER.element,
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

  if (news.length === 0) return <></>

  const isCard = config.layout === 'card'

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="mb-10 text-center md:mb-14">
          <ScrollReveal>
            <SectionLabel>News</SectionLabel>
          </ScrollReveal>
          <h2 className="mt-4 font-heading text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl">
            <SplitText variant="words">
              {config.title}
            </SplitText>
          </h2>
        </div>

        <div
          ref={listRef}
          className={isCard ? 'grid gap-6 md:grid-cols-2' : 'divide-y divide-border'}
        >
          {news.map((item) =>
            isCard ? (
              <Link
                key={item.id}
                href={`/news/${item.slug}`}
                data-news-item=""
                className="group rounded-lg border border-border bg-card p-5 transition-shadow duration-300 hover:shadow-lg"
              >
                <time className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                  {formatDate(item.publishedAt)}
                </time>
                <h3 className="mt-2 font-heading text-base font-medium tracking-tight transition-colors group-hover:text-primary-dark md:text-lg">
                  {item.title}
                </h3>
              </Link>
            ) : (
              <Link
                key={item.id}
                href={`/news/${item.slug}`}
                data-news-item=""
                className="group flex items-baseline gap-4 py-4 transition-colors first:pt-0 last:pb-0"
              >
                <time className="shrink-0 text-[11px] tabular-nums uppercase tracking-[0.1em] text-muted-foreground">
                  {formatDate(item.publishedAt)}
                </time>
                <h3 className="text-sm font-medium transition-colors group-hover:text-primary-dark md:text-base">
                  {item.title}
                </h3>
              </Link>
            ),
          )}
        </div>

        {config.showViewAllLink && (
          <ScrollReveal delay={0.2}>
            <div className="mt-8 text-center">
              <Link
                href="/news"
                className="group relative inline-block text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-primary-dark"
              >
                全てのお知らせ &rarr;
                <span className="absolute bottom-0 left-0 h-px w-0 bg-primary-dark/60 transition-all duration-300 group-hover:w-full" />
              </Link>
            </div>
          </ScrollReveal>
        )}
      </div>
    </section>
  )
}
