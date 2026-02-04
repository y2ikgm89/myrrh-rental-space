'use client'

/**
 * HeroSection — Full-viewport hero with parallax background + SplitText
 *
 * No pinning. Parallax background image moves on scroll.
 * SplitText animates the catchcopy on load.
 */

import { useRef, type ReactElement } from 'react'
import Image from 'next/image'
import { useGSAP } from '@gsap/react'
import { gsap } from '@/public/lib/gsap-config'
import { SplitText } from '@/public/components/animations/SplitText'
import { MagneticButton } from '@/public/components/animations/MagneticButton'
import { ScrollIndicator } from '@/public/components/layouts/ScrollIndicator'
import { DURATION, EASE, PARALLAX, SCROLL_TRIGGER } from '@/public/lib/animations'
import type { HeroParallaxConfig } from '@/shared/lib/validations/section'

const DEFAULT_BG_IMAGE =
  'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=1600&q=80'

interface HeroSectionProps {
  readonly config: HeroParallaxConfig
}

export function HeroSection({ config }: HeroSectionProps): ReactElement {
  const sectionRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const section = sectionRef.current
      const content = contentRef.current
      const image = imageRef.current
      if (!section || !content || !image) return

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // Content entrance
        gsap.fromTo(
          content,
          { opacity: 0, y: 50 },
          {
            opacity: 1,
            y: 0,
            duration: DURATION.hero,
            ease: EASE.outExpo,
            delay: 0.3,
          },
        )

        // Parallax background
        gsap.set(image, { scale: 1.15 })
        gsap.fromTo(
          image,
          { y: -PARALLAX.subtle * 80 },
          {
            y: PARALLAX.subtle * 80,
            ease: 'none',
            scrollTrigger: {
              trigger: section,
              ...SCROLL_TRIGGER.scrub,
            },
          },
        )
      })
    },
    { scope: sectionRef },
  )

  return (
    <section
      ref={sectionRef}
      className="relative flex h-screen items-center justify-center overflow-hidden"
    >
      {/* Background image with parallax */}
      <div className="absolute inset-0">
        <div ref={imageRef} className="h-full w-full">
          <Image
            src={config.backgroundImageUrl || DEFAULT_BG_IMAGE}
            alt="洗練されたレンタルスペースのインテリア"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
      </div>

      {/* Gradient overlay */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/40 to-background"
        aria-hidden="true"
      />

      {/* Content */}
      <div
        ref={contentRef}
        className="relative z-10 px-5 text-center md:px-8"
      >
        <p className="mb-6 text-[11px] uppercase tracking-[0.3em] text-primary-dark md:tracking-[0.4em]">
          Luxury Rental Space
        </p>

        <h1 className="font-heading text-3xl font-bold leading-[1.15] tracking-tight sm:text-4xl md:text-5xl lg:text-7xl">
          <SplitText variant="words" trigger={false} delay={0.5}>
            {config.title || '洗練された空間で 特別なひとときを'}
          </SplitText>
        </h1>

        <p className="mx-auto mt-6 max-w-lg text-sm leading-relaxed text-muted-foreground md:mt-8 md:text-base">
          {config.subtitle || '厳選されたレンタルスペースが、あなたの大切な瞬間を彩ります。'}
        </p>

        <div className="mt-8 md:mt-12">
          <MagneticButton href="/reservation">
            Reserve Now
          </MagneticButton>
        </div>
      </div>

      {/* Scroll hint */}
      {config.scrollIndicator !== false && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <ScrollIndicator />
        </div>
      )}
    </section>
  )
}
