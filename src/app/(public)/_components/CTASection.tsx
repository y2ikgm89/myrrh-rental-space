'use client'

/**
 * CTASection — Call-to-action with accent background + MagneticButton
 *
 * Single MagneticButton for Reserve Now + underline-reveal text link for Contact.
 * ScrollReveal entrance animation.
 */

import type { ReactElement } from 'react'
import Link from 'next/link'
import { SplitText } from '@/public/components/animations/SplitText'
import { ScrollReveal } from '@/public/components/animations/ScrollReveal'
import { MagneticButton } from '@/public/components/animations/MagneticButton'
import { SectionLabel } from '@/public/components/ui/SectionLabel'
import type { CtaConfig } from '@/shared/lib/validations/section'

interface CTASectionProps {
  readonly config: CtaConfig
}

export function CTASection({ config }: CTASectionProps): ReactElement {
  const primaryButton = config.buttons.find((b) => b.variant === 'primary')
  const secondaryButton = config.buttons.find((b) => b.variant === 'secondary')
  return (
    <section className="bg-accent py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="text-center">
          <ScrollReveal>
            <SectionLabel>Ready to Begin?</SectionLabel>
          </ScrollReveal>

          <h2 className="mt-6 font-heading text-2xl font-bold tracking-tight md:text-3xl lg:text-5xl">
            <SplitText variant="words">
              {config.title}
            </SplitText>
          </h2>

          {config.description && (
            <ScrollReveal delay={0.2}>
              <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-muted-foreground md:mt-8 md:text-base">
                {config.description}
              </p>
            </ScrollReveal>
          )}

          <ScrollReveal delay={0.3}>
            <div className="mt-8 flex flex-col items-center gap-6 md:mt-12">
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
        </div>
      </div>
    </section>
  )
}
