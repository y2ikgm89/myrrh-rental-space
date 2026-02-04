/**
 * EmbedSection — External content iframe embed
 *
 * Server Component。YouTube, Google Forms 等の外部コンテンツを埋め込み。
 * Configurable aspect ratio and max width.
 */

import type { ReactElement } from 'react'
import { ScrollReveal } from '@/public/components/animations/ScrollReveal'
import { SectionLabel } from '@/public/components/ui/SectionLabel'
import type { EmbedConfig } from '@/shared/lib/validations/section'

const MAX_WIDTH_MAP = {
  sm: 'max-w-2xl',
  md: 'max-w-3xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
  full: 'max-w-full',
} as const

const ASPECT_RATIO_MAP = {
  '16:9': 'aspect-video',
  '4:3': 'aspect-[4/3]',
  '1:1': 'aspect-square',
  auto: '',
} as const

interface EmbedSectionProps {
  readonly config: EmbedConfig
}

export function EmbedSection({ config }: EmbedSectionProps): ReactElement {
  const maxWidthClass = MAX_WIDTH_MAP[config.maxWidth] ?? MAX_WIDTH_MAP.lg
  const aspectClass = ASPECT_RATIO_MAP[config.aspectRatio] ?? ASPECT_RATIO_MAP['16:9']

  return (
    <section className="py-16 md:py-24">
      <div className={`mx-auto px-5 md:px-8 ${maxWidthClass}`}>
        {config.title && (
          <div className="mb-8 text-center md:mb-12">
            <ScrollReveal>
              <SectionLabel>Media</SectionLabel>
              <h2 className="mt-4 font-heading text-2xl font-bold tracking-tight md:text-3xl">
                {config.title}
              </h2>
            </ScrollReveal>
          </div>
        )}

        <ScrollReveal>
          {config.embedUrl ? (
            <div className={`overflow-hidden rounded-lg ${aspectClass}`}>
              <iframe
                src={config.embedUrl}
                className="h-full w-full border-0"
                allowFullScreen
                loading="lazy"
                title={config.title ?? 'Embedded content'}
              />
            </div>
          ) : config.embedCode ? (
            <div
              className={`overflow-hidden rounded-lg ${aspectClass}`}
              dangerouslySetInnerHTML={{ __html: config.embedCode }}
            />
          ) : (
            <div className="flex h-48 items-center justify-center rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">
                埋め込みURLまたはコードを設定してください。
              </p>
            </div>
          )}
        </ScrollReveal>
      </div>
    </section>
  )
}
