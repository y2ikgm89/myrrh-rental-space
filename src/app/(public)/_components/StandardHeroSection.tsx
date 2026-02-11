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
import { DURATION, EASE, SCROLL_TRIGGER } from '@/public/lib/animations'
import type { HeroConfig } from '@/shared/lib/validations/section'
import type { SectionDesign } from '@/shared/lib/validations/section-design'
import { getTitleClasses, getTitleStyle, getTextStyle } from '@/public/components/sections/SectionWrapper'

const HEIGHT_MAP = {
  sm: 'h-[40vh]',
  md: 'h-[60vh]',
  lg: 'h-[80vh]',
  full: 'h-svh',
} as const

interface StandardHeroSectionProps {
  readonly config: HeroConfig
  readonly design: SectionDesign
}

export function StandardHeroSection({ config, design }: StandardHeroSectionProps): ReactElement {
  const sectionRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLDivElement>(null)

  const isParallax = config.variant === 'parallax'

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

        // Parallax background when variant is 'parallax'
        const image = imageRef.current
        const section = sectionRef.current
        if (!image || !section || !isParallax) return

        const displacement = config.parallaxSpeed * 200
        gsap.set(image, { scale: 1.15 })
        gsap.fromTo(
          image,
          { y: -displacement },
          {
            y: displacement,
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

  const heightClass = HEIGHT_MAP[config.height] ?? HEIGHT_MAP.md
  const primaryButton = config.buttons.find((b) => b.variant === 'primary')
  const secondaryButton = config.buttons.find((b) => b.variant === 'secondary')
  const variant = config.variant

  // minimal: no background image, smaller height
  if (variant === 'minimal') {
    return (
      <section
        ref={sectionRef}
        data-hero=""
        className="relative flex items-center justify-center overflow-hidden pt-[var(--header-height)] h-[40vh]"
      >
        <div ref={contentRef} className="relative z-10 px-5 text-center md:px-8">
          {config.title && (
            <h1 className={`font-heading ${getTitleClasses(design)} font-bold leading-tight tracking-tight`} style={getTitleStyle(design)}>
              <SplitText variant="words" trigger={false} delay={0.3}>
                {config.title}
              </SplitText>
            </h1>
          )}
          {config.subtitle && (
            <ScrollReveal delay={0.2}>
              <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground md:mt-6 md:text-base" style={getTextStyle(design)}>
                {config.subtitle}
              </p>
            </ScrollReveal>
          )}
        </div>
      </section>
    )
  }

  // split: 2-column layout (text left, image right)
  if (variant === 'split') {
    return (
      <section
        ref={sectionRef}
        data-hero=""
        className={`relative overflow-hidden pt-[var(--header-height)] ${heightClass}`}
      >
        <div ref={contentRef} className="relative z-10 mx-auto flex h-full max-w-6xl flex-col items-center px-5 md:flex-row md:px-8">
          <div className="flex flex-1 flex-col justify-center py-12 md:py-0 md:pr-12">
            {config.title && (
              <h1 className={`font-heading ${getTitleClasses(design)} font-bold leading-tight tracking-tight`} style={getTitleStyle(design)}>
                <SplitText variant="words" trigger={false} delay={0.3}>
                  {config.title}
                </SplitText>
              </h1>
            )}
            {config.subtitle && (
              <ScrollReveal delay={0.2}>
                <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground md:mt-6 md:text-base" style={getTextStyle(design)}>
                  {config.subtitle}
                </p>
              </ScrollReveal>
            )}
            {(primaryButton ?? secondaryButton) && (
              <ScrollReveal delay={0.3}>
                <div className="mt-6 flex flex-wrap items-center gap-4 md:mt-10">
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
          {config.backgroundImageUrl && (
            <div className="relative flex-1">
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg">
                <Image
                  src={config.backgroundImageUrl}
                  alt=""
                  fill
                  sizes="50vw"
                  className="object-cover"
                  priority
                />
              </div>
            </div>
          )}
        </div>
      </section>
    )
  }

  // video: same as default but with <video> background when videoUrl is set
  const useVideo = variant === 'video' && config.videoUrl

  return (
    <section
      ref={sectionRef}
      data-hero=""
      className={`relative flex items-center justify-center overflow-hidden pt-[var(--header-height)] ${heightClass}`}
    >
      {/* Background image or video */}
      {useVideo ? (
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src={config.videoUrl} />
        </video>
      ) : config.backgroundImageUrl ? (
        <div className="absolute inset-0">
          <div ref={imageRef} className="relative h-full w-full">
            <Image
              src={config.backgroundImageUrl}
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />
          </div>
        </div>
      ) : null}

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
          <h1 className={`font-heading ${getTitleClasses(design)} font-bold leading-tight tracking-tight`} style={getTitleStyle(design)}>
            <SplitText variant="words" trigger={false} delay={0.3}>
              {config.title}
            </SplitText>
          </h1>
        )}

        {config.subtitle && (
          <ScrollReveal delay={0.2}>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground md:mt-6 md:text-base" style={getTextStyle(design)}>
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
