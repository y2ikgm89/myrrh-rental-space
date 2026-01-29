/**
 * お問い合わせフォームセクション
 *
 * 既存のContactFormをセクション形式でラップ
 * Turnstile Site Keyはサーバーサイドで取得
 *
 * 共通スタイルを使用してデザイン変更に対応
 */

import type { ReactElement } from 'react'
import type { ContactFormConfig } from '@/shared/lib/validations/page-section'
import { ContactForm } from '@/app/(public)/contact/_components/ContactForm'
import { getTurnstileSiteKey } from '@/public/actions/settings'
import {
  sectionVariants,
  sectionTitleVariants,
} from '@/public/lib/styles/section-variants'

interface ContactFormSectionProps {
  title?: string | null
  config: ContactFormConfig
}

export async function ContactFormSection({
  title,
  config,
}: ContactFormSectionProps): Promise<ReactElement> {
  // Turnstile Site Keyを取得
  const turnstileSiteKey = await getTurnstileSiteKey()

  return (
    <section className={sectionVariants()}>
      <div className="container">
        {(title || config.description) && (
          <div className="text-center mb-8">
            {title && (
              <h2 className={sectionTitleVariants({ align: 'center' })}>{title}</h2>
            )}
            {config.description && (
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {config.description}
              </p>
            )}
          </div>
        )}
        <div className="max-w-xl mx-auto">
          <ContactForm turnstileSiteKey={turnstileSiteKey} />
        </div>
      </div>
    </section>
  )
}
