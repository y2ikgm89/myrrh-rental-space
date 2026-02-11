/**
 * CustomSection — Lexical HTML レンダリング
 *
 * Server Component。.prose wrapper で Lexical エディタの HTML 出力を表示。
 * SplitText で見出し、ScrollReveal でコンテンツの entrance。
 */

import type { ReactElement } from 'react'
import { ScrollReveal } from '@/public/components/animations/ScrollReveal'
import { SectionLabel } from '@/public/components/ui/SectionLabel'
import { SectionWrapper, getTitleClasses, getTitleStyle, getTextStyle } from '@/public/components/sections/SectionWrapper'
import type { CustomConfig } from '@/shared/lib/validations/section'
import type { SectionDesign } from '@/shared/lib/validations/section-design'

const MAX_WIDTH_MAP = {
  sm: 'max-w-2xl',
  md: 'max-w-3xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
  full: 'max-w-full',
} as const

const PADDING_MAP = {
  none: '',
  sm: 'py-8 md:py-12',
  md: 'py-16 md:py-24',
  lg: 'py-24 md:py-32',
} as const

interface CustomSectionProps {
  readonly config: CustomConfig
  readonly content: string | null
  readonly title: string | null
  readonly design: SectionDesign
}

export function CustomSection({ config, content, title, design }: CustomSectionProps): ReactElement {
  const maxWidthClass = MAX_WIDTH_MAP[config.maxWidth] ?? MAX_WIDTH_MAP.lg
  const paddingClass = PADDING_MAP[config.padding] ?? PADDING_MAP.md

  return (
    <SectionWrapper design={design} skipPadding skipContainer>
      <div className={paddingClass}>
        <div className={`mx-auto px-5 md:px-8 ${maxWidthClass}`}>
          {title && (
            <div className="mb-8 md:mb-12">
              <ScrollReveal>
                {config.sectionLabel && <SectionLabel>{config.sectionLabel}</SectionLabel>}
                <h2
                  className={`mt-4 font-heading ${getTitleClasses(design)} font-bold tracking-tight`}
                  style={getTitleStyle(design)}
                >
                  {title}
                </h2>
              </ScrollReveal>
            </div>
          )}

          {content && (
            <ScrollReveal>
              {/* Lexical editor sanitized HTML output */}
              <div
                className="prose prose-neutral max-w-none"
                style={getTextStyle(design)}
                dangerouslySetInnerHTML={{ __html: content }}
              />
            </ScrollReveal>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}
