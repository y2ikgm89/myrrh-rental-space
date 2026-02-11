'use client'

/**
 * ContactFormSection — Configurable contact form section
 *
 * Field toggles for name, phone, subject. Email + message always visible.
 * MagneticButton for submit. ScrollReveal for entrance.
 */

import type { ReactElement } from 'react'
import { ScrollReveal } from '@/public/components/animations/ScrollReveal'
import { SplitText } from '@/public/components/animations/SplitText'
import { MagneticButton } from '@/public/components/animations/MagneticButton'
import { SectionWrapper, getTitleClasses, getTitleStyle, getTextStyle } from '@/public/components/sections/SectionWrapper'
import { SectionLabel } from '@/public/components/ui/SectionLabel'
import type { ContactFormConfig } from '@/shared/lib/validations/section'
import type { SectionDesign } from '@/shared/lib/validations/section-design'

interface ContactFormSectionProps {
  readonly config: ContactFormConfig
  readonly design: SectionDesign
}

const INPUT_CLASS =
  'w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary'

export function ContactFormSection({ config, design }: ContactFormSectionProps): ReactElement {
  return (
    <SectionWrapper design={design}>
      <div className="mx-auto max-w-2xl">
        <div className="mb-10 text-center md:mb-14">
          <ScrollReveal>
            {config.sectionLabel && <SectionLabel>{config.sectionLabel}</SectionLabel>}
          </ScrollReveal>
          <h2 className={`mt-4 font-heading ${getTitleClasses(design)} font-bold tracking-tight`} style={getTitleStyle(design)}>
            <SplitText variant="words">
              {config.title}
            </SplitText>
          </h2>
          {config.description && (
            <ScrollReveal delay={0.2}>
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground" style={getTextStyle(design)}>
                {config.description}
              </p>
            </ScrollReveal>
          )}
        </div>

        <ScrollReveal delay={0.3}>
          <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
            {/* Name + Email row or Email full-width */}
            {config.showNameField ? (
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                    お名前
                  </label>
                  <input
                    type="text"
                    placeholder="山田 太郎"
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                    メールアドレス
                  </label>
                  <input
                    type="email"
                    placeholder="mail@example.com"
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                  メールアドレス
                </label>
                <input
                  type="email"
                  placeholder="mail@example.com"
                  className={INPUT_CLASS}
                />
              </div>
            )}

            {/* Phone */}
            {config.showPhoneField && (
              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                  電話番号
                </label>
                <input
                  type="tel"
                  placeholder="090-1234-5678"
                  className={INPUT_CLASS}
                />
              </div>
            )}

            {/* Subject */}
            {config.showSubjectField && (
              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                  件名
                </label>
                <input
                  type="text"
                  placeholder="お問い合わせの件名"
                  className={INPUT_CLASS}
                />
              </div>
            )}

            {/* Message (always visible) */}
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                お問い合わせ内容
              </label>
              <textarea
                rows={5}
                placeholder="お問い合わせ内容をご記入ください"
                className={INPUT_CLASS}
              />
            </div>

            <div className="pt-2">
              <MagneticButton strength={0.2}>
                {config.submitButtonText}
              </MagneticButton>
            </div>

            <p className="text-xs text-muted-foreground">
              ※ これはデモページです。実際の送信は行われません。
            </p>
          </form>
        </ScrollReveal>
      </div>
    </SectionWrapper>
  )
}
