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
import { SectionWrapper, getTitleClasses, getTitleStyle, getTextStyle } from '@/public/components/sections/SectionWrapper'
import type { CtaConfig } from '@/shared/lib/validations/section'
import type { SectionDesign } from '@/shared/lib/validations/section-design'

interface CTASectionProps {
  readonly config: CtaConfig
  readonly design: SectionDesign
}

export function CTASection({ config, design }: CTASectionProps): ReactElement {
  const primaryButton = config.buttons.find((b) => b.variant === 'primary')
  const secondaryButton = config.buttons.find((b) => b.variant === 'secondary')
  return (
    <SectionWrapper design={design}>
      <div className="text-center">
        <ScrollReveal>
          {config.sectionLabel && <SectionLabel>{config.sectionLabel}</SectionLabel>}
        </ScrollReveal>

        <h2
          className={`mt-6 font-heading ${getTitleClasses(design)} font-bold tracking-tight`}
          style={getTitleStyle(design)}
        >
          <SplitText variant="words">
            {config.title}
          </SplitText>
        </h2>

        {config.description && (
          <ScrollReveal delay={0.2}>
            <p
              className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-muted-foreground md:mt-8 md:text-base"
              style={getTextStyle(design)}
            >
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
    </SectionWrapper>
  )
}
