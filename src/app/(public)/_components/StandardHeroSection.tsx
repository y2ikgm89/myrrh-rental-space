'use client'

/**
 * StandardHeroSection — Generic hero with height/overlay/CTA variants
 *
 * Configurable height, background image overlay, SplitText title,
 * and CTA buttons via MagneticButton + text link.
 */

import { useRef, type ReactElement } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useGSAP } from '@gsap/react'
import { gsap } from '@/public/lib/gsap-config'
import { SplitText } from '@/public/components/animations/SplitText'
import { ScrollReveal } from '@/public/components/animations/ScrollReveal'
import { MagneticButton } from '@/public/components/animations/MagneticButton'
import { DURATION, EASE } from '@/public/lib/animations'
import type { HeroConfig } from '@/shared/lib/validations/section'

const HEIGHT_MAP = {
  sm: 'h-[40vh]',
  md: 'h-[60vh]',
  lg: 'h-[80vh]',
  full: 'h-svh',
} as const

interface StandardHeroSectionProps {
  readonly config: HeroConfig
}

export function StandardHeroSection({ config }: StandardHeroSectionProps): ReactElement {
  const sectionRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const content = contentRef.current
      if (!content) return

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          content,
          { opacity: 0, y: 40 },
          {
            opacity: 1,
            y: 0,
            duration: DURATION.hero,
            ease: EASE.outExpo,
            delay: 0.2,
          },
        )
      })
    },
    { scope: sectionRef },
  )

  const heightClass = HEIGHT_MAP[config.height] ?? HEIGHT_MAP.md
  const primaryButton = config.buttons.find((b) => b.variant === 'primary')
  const secondaryButton = config.buttons.find((b) => b.variant === 'secondary')

  return (
    <section
      ref={sectionRef}
      className={`relative flex items-center justify-center overflow-hidden ${heightClass}`}
    >
      {/* Background image */}
      {config.backgroundImageUrl && (
        <div className="absolute inset-0">
          <Image
            src={config.backgroundImageUrl}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        </div>
      )}

      {/* Overlay */}
      {config.overlay && (
        <div
          className="absolute inset-0 bg-background"
          style={{ opacity: config.overlayOpacity / 100 }}
          aria-hidden="true"
        />
      )}

      {/* Content */}
      <div ref={contentRef} className="relative z-10 px-5 text-center md:px-8">
        {config.title && (
          <h1 className="font-heading text-2xl font-bold leading-tight tracking-tight sm:text-3xl md:text-4xl lg:text-5xl">
            <SplitText variant="words" trigger={false} delay={0.3}>
              {config.title}
            </SplitText>
          </h1>
        )}

        {config.subtitle && (
          <ScrollReveal delay={0.2}>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground md:mt-6 md:text-base">
              {config.subtitle}
            </p>
          </ScrollReveal>
        )}

        {(primaryButton ?? secondaryButton) && (
          <ScrollReveal delay={0.3}>
            <div className="mt-6 flex flex-col items-center gap-4 md:mt-10">
              {primaryButton && (
                <MagneticButton href={primaryButton.url} strength={0.35}>
                  {primaryButton.text}
                </MagneticButton>
              )}
              {secondaryButton && (
                <Link
                  href={secondaryButton.url}
                  className="group relative inline-block text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-primary-dark"
                >
                  {secondaryButton.text}
                  <span className="absolute bottom-0 left-0 h-px w-0 bg-primary-dark/60 transition-all duration-300 group-hover:w-full" />
                </Link>
              )}
            </div>
          </ScrollReveal>
        )}
      </div>
    </section>
  )
}
