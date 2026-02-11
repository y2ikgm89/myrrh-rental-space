'use client'

/**
 * InstagramSection — Instagram feed placeholder (API 連携は後日)
 *
 * Placeholder grid with section label and heading.
 * ScrollReveal for entrance animation.
 */

import { useRef, type ReactElement } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap } from '@/public/lib/gsap-config'
import { ScrollReveal } from '@/public/components/animations/ScrollReveal'
import { SplitText } from '@/public/components/animations/SplitText'
import { SectionWrapper, getTitleClasses, getTitleStyle, getTextStyle } from '@/public/components/sections/SectionWrapper'
import { SectionLabel } from '@/public/components/ui/SectionLabel'
import { DURATION, EASE, STAGGER } from '@/public/lib/animations'
import { getGridColsClass, GAP_MAP } from '@/public/lib/section-style-maps'
import type { InstagramConfig } from '@/shared/lib/validations/section'
import { parseGapSize } from '@/shared/lib/validations/section'
import type { SectionDesign } from '@/shared/lib/validations/section-design'

interface InstagramSectionProps {
  readonly config: InstagramConfig
  readonly design: SectionDesign
}

export function InstagramSection({ config, design }: InstagramSectionProps): ReactElement {
  const gridRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const grid = gridRef.current
      if (!grid) return

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const items = grid.querySelectorAll('[data-ig-placeholder]')
        if (items.length === 0) return

        gsap.fromTo(
          items,
          { scale: 0.9, opacity: 0 },
          {
            scale: 1,
            opacity: 1,
            duration: DURATION.normal,
            ease: EASE.outQuart,
            stagger: STAGGER.card * 0.5,
            scrollTrigger: {
              trigger: grid,
              start: 'top 85%',
              toggleActions: 'play none none none',
            },
          },
        )
      })
    },
    { scope: gridRef },
  )

  return (
    <SectionWrapper design={design}>
      <div className="mb-10 text-center md:mb-14">
        <ScrollReveal>
          {config.sectionLabel && <SectionLabel>{config.sectionLabel}</SectionLabel>}
        </ScrollReveal>
        <h2 className={`mt-4 font-heading ${getTitleClasses(design)} font-bold tracking-tight`} style={getTitleStyle(design)}>
          <SplitText variant="words">
            {config.title}
          </SplitText>
        </h2>
      </div>

      <div ref={gridRef} className={`grid grid-cols-2 ${getGridColsClass(config.columns)} ${GAP_MAP[parseGapSize(config.gap)]}`}>
        {Array.from({ length: config.count }, (_, i) => (
          <div
            key={i}
            data-ig-placeholder=""
            className="flex aspect-square items-center justify-center rounded-lg bg-muted"
          >
            <svg
              className="h-8 w-8 text-muted-foreground/40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <rect x="2" y="2" width="20" height="20" rx="5" strokeWidth={1.5} />
              <circle cx="12" cy="12" r="4.5" strokeWidth={1.5} />
              <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
            </svg>
          </div>
        ))}
      </div>

      <ScrollReveal delay={0.3}>
        <p className="mt-6 text-center text-xs text-muted-foreground" style={getTextStyle(design)}>
          Instagram API 連携は今後実装予定です。
        </p>
      </ScrollReveal>
    </SectionWrapper>
  )
}
