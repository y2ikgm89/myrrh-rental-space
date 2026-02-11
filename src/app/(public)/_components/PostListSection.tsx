'use client'

/**
 * PostListSection — Blog post listing with grid/list layout
 *
 * Card grid with thumbnail, category badge, title, and excerpt.
 * useGSAP stagger for card entrance animation.
 */

import { useRef, type ReactElement } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useGSAP } from '@gsap/react'
import { gsap } from '@/public/lib/gsap-config'
import { ScrollReveal } from '@/public/components/animations/ScrollReveal'
import { SplitText } from '@/public/components/animations/SplitText'
import { SectionLabel } from '@/public/components/ui/SectionLabel'
import { SectionWrapper, getTitleClasses, getTitleStyle, getTextStyle } from '@/public/components/sections/SectionWrapper'
import { DURATION, EASE, STAGGER } from '@/public/lib/animations'
import type { PostListConfig } from '@/shared/lib/validations/section'
import type { SectionDesign } from '@/shared/lib/validations/section-design'

export interface PostData {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly excerpt: string
  readonly thumbnailUrl: string
  readonly publishedAt: Date | null
  readonly categoryName: string | null
}

interface PostListSectionProps {
  readonly config: PostListConfig
  readonly posts: readonly PostData[]
  readonly design: SectionDesign
}

const COLUMNS_MAP = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
} as const

export function PostListSection({ config, posts, design }: PostListSectionProps): ReactElement {
  const gridRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const grid = gridRef.current
      if (!grid) return

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const cards = grid.querySelectorAll('[data-post-card]')
        if (cards.length === 0) return

        gsap.fromTo(
          cards,
          { y: 40, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: DURATION.slow,
            ease: EASE.outQuart,
            stagger: STAGGER.card,
            scrollTrigger: {
              trigger: grid,
              start: 'top 80%',
              toggleActions: 'play none none none',
            },
          },
        )
      })
    },
    { scope: gridRef },
  )

  if (posts.length === 0) return <></>

  const isList = config.layout === 'list'
  const colKey = Math.min(Math.max(config.columns, 1), 4)

  return (
    <SectionWrapper design={design}>
        <div className="mb-12 text-center md:mb-16">
          <ScrollReveal>
            {config.sectionLabel && <SectionLabel>{config.sectionLabel}</SectionLabel>}
          </ScrollReveal>
          <h2 className={`mt-4 font-heading ${getTitleClasses(design)} font-bold tracking-tight`} style={getTitleStyle(design)}>
            <SplitText variant="words">
              {config.title}
            </SplitText>
          </h2>
        </div>

        <div
          ref={gridRef}
          className={isList ? 'flex flex-col gap-4' : `grid gap-6 ${COLUMNS_MAP[colKey as keyof typeof COLUMNS_MAP]}`}
        >
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/posts/${post.slug}`}
              data-post-card=""
              className={`group overflow-hidden rounded-lg border border-border bg-card transition-shadow duration-300 hover:shadow-lg ${
                isList ? 'flex' : ''
              }`}
            >
              <div className={`overflow-hidden ${isList ? 'w-1/3 min-w-[120px]' : 'aspect-[16/9]'}`}>
                <Image
                  src={post.thumbnailUrl}
                  alt={post.title}
                  width={400}
                  height={225}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes={isList ? '33vw' : `(max-width: 768px) 100vw, ${Math.round(100 / colKey)}vw`}
                />
              </div>
              <div className={`p-4 md:p-5 ${isList ? 'flex-1' : ''}`}>
                {post.categoryName && (
                  <span className="text-[10px] uppercase tracking-widest text-primary-dark">
                    {post.categoryName}
                  </span>
                )}
                <h3 className="mt-1 font-heading text-base font-medium tracking-tight transition-colors group-hover:text-primary-dark md:text-lg">
                  {post.title}
                </h3>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground" style={getTextStyle(design)}>
                  {post.excerpt}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {config.showViewAllLink && (
          <ScrollReveal delay={0.2}>
            <div className="mt-10 text-center">
              <Link
                href={config.viewAllUrl}
                className="group relative inline-block text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-primary-dark"
              >
                {config.viewAllText} &rarr;
                <span className="absolute bottom-0 left-0 h-px w-0 bg-primary-dark/60 transition-all duration-300 group-hover:w-full" />
              </Link>
            </div>
          </ScrollReveal>
        )}
    </SectionWrapper>
  )
}
