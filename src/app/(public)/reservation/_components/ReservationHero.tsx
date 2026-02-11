'use client'

/**
 * ReservationHero — Mini hero (40vh) with SplitText title
 */

import type { ReactElement } from 'react'
import { SplitText } from '@/public/components/animations/SplitText'
import { ScrollReveal } from '@/public/components/animations/ScrollReveal'
import { titleSizeMap } from '@/public/components/sections/SectionWrapper'

export function ReservationHero(): ReactElement {
  return (
    <section data-hero="" className="relative flex h-[40vh] min-h-[280px] items-end overflow-hidden pb-10 pt-[var(--header-height)] md:pb-16">
      <div
        className="absolute inset-0 bg-gradient-to-b from-surface via-background to-background"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full max-w-6xl px-5 md:px-8">
        <h1 className={`font-heading ${titleSizeMap['3xl']} font-bold uppercase tracking-tight`}>
          <SplitText variant="chars" trigger={false} delay={0.3}>
            Reserve
          </SplitText>
        </h1>

        <ScrollReveal delay={0.5}>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:text-base">
            3ステップで簡単予約。お好みのスペースと日時をお選びください。
          </p>
        </ScrollReveal>
      </div>
    </section>
  )
}
