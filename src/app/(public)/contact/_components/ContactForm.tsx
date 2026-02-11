'use client'

/**
 * ContactForm — Dummy contact form with ScrollReveal
 */

import type { ReactElement } from 'react'
import { ScrollReveal } from '@/public/components/animations/ScrollReveal'
import { MagneticButton } from '@/public/components/animations/MagneticButton'

const INPUT_CLASS =
  'w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary'

export function ContactForm(): ReactElement {
  return (
    <ScrollReveal>
      <form
        onSubmit={(e) => e.preventDefault()}
        className="space-y-5"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label htmlFor="contact-name" className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              お名前
            </label>
            <input
              id="contact-name"
              type="text"
              placeholder="山田 太郎"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="contact-email" className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              メールアドレス
            </label>
            <input
              id="contact-email"
              type="email"
              placeholder="mail@example.com"
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div>
          <label htmlFor="contact-subject" className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            件名
          </label>
          <input
            id="contact-subject"
            type="text"
            placeholder="お問い合わせの件名"
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="contact-message" className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            お問い合わせ内容
          </label>
          <textarea
            id="contact-message"
            rows={5}
            placeholder="お問い合わせ内容をご記入ください"
            className={INPUT_CLASS}
          />
        </div>

        <div className="pt-2">
          <MagneticButton strength={0.2}>
            送信する
          </MagneticButton>
        </div>

        <p className="text-xs text-muted-foreground">
          ※ これはデモページです。実際の送信は行われません。
        </p>
      </form>
    </ScrollReveal>
  )
}
