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
import { SectionLabel } from '@/public/components/ui/SectionLabel'
import type { ContactFormConfig } from '@/shared/lib/validations/section'

interface ContactFormSectionProps {
  readonly config: ContactFormConfig
}

const INPUT_CLASS =
  'w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

export function ContactFormSection({ config }: ContactFormSectionProps): ReactElement {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-2xl px-5 md:px-8">
        <div className="mb-10 text-center md:mb-14">
          <ScrollReveal>
            <SectionLabel>Contact</SectionLabel>
          </ScrollReveal>
          <h2 className="mt-4 font-heading text-2xl font-bold tracking-tight md:text-3xl">
            <SplitText variant="words">
              {config.title}
            </SplitText>
          </h2>
          {config.description && (
            <ScrollReveal delay={0.2}>
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
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
    </section>
  )
}
