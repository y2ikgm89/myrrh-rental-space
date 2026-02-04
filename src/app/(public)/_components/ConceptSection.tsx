'use client'

/**
 * ConceptSection — Text + parallax image layout
 *
 * Left: SplitText heading + body text with ScrollReveal
 * Right: ParallaxImage
 */

import type { ReactElement } from 'react'
import { SplitText } from '@/public/components/animations/SplitText'
import { ScrollReveal } from '@/public/components/animations/ScrollReveal'
import { ParallaxImage } from '@/public/components/animations/ParallaxImage'
import { SectionLabel } from '@/public/components/ui/SectionLabel'
import type { ConceptConfig } from '@/shared/lib/validations/section'

interface ConceptSectionProps {
  readonly config: ConceptConfig
}

export function ConceptSection({ config }: ConceptSectionProps): ReactElement {
  const heading = config.heading || '空間が、体験を変える'
  const body =
    config.body ||
    '洗練されたデザインと上質な設備が調和する空間。\nビジネスミーティングからプライベートパーティーまで、\nあらゆるシーンに最適な環境をご用意しています。'
  const imageUrl =
    config.imageUrl ||
    'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1000&q=80'
  const imagePosition = config.imagePosition
  return (
    <section className="py-24 md:py-32 lg:py-40">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className={`grid items-center gap-12 md:grid-cols-2 md:gap-16 lg:gap-20${imagePosition === 'left' ? ' md:[direction:rtl] [&>*]:[direction:ltr]' : ''}`}>
          {/* Text */}
          <div>
            <ScrollReveal>
              <SectionLabel>Our Philosophy</SectionLabel>
            </ScrollReveal>

            <h2 className="mt-6 font-heading text-2xl font-bold leading-[1.2] tracking-tight md:text-3xl lg:text-4xl">
              <SplitText variant="lines">
                {heading}
              </SplitText>
            </h2>

            <ScrollReveal delay={0.2}>
              <p className="mt-6 text-sm leading-[1.9] text-muted-foreground md:text-base">
                {body.split('\n').map((line, i, arr) => (
                  <span key={i}>
                    {line}
                    {i < arr.length - 1 && <br />}
                  </span>
                ))}
              </p>
            </ScrollReveal>
          </div>

          {/* Image */}
          <ScrollReveal delay={0.1}>
            <ParallaxImage
              src={imageUrl}
              alt="コンセプトイメージ"
              className="relative aspect-[4/5] rounded-lg"
            />
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}
