/**
 * FAQセクション（新API対応）
 *
 * HomepageSectionData.config から設定を受け取りレンダリング
 * アコーディオン形式
 */

import { tv } from 'tailwind-variants'
import { Container } from '@/public/components/ui'
import { FAQPageJsonLd } from '@/public/components/seo/JsonLd'
import type { FaqConfig } from '@/shared/lib/validations/homepage-section'
import type { ReactElement } from 'react'

const faqSectionVariants = tv({
  slots: {
    section: 'py-16 sm:py-20 lg:py-24 bg-muted/30',
    header: 'text-center mb-12',
    sectionTitle: 'text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight',
    list: 'space-y-4',
    item: 'bg-white rounded-lg shadow-sm',
    question:
      'w-full flex items-center justify-between p-4 sm:p-6 text-left font-medium',
    questionText: 'flex-1 pr-4',
    icon: 'h-5 w-5 text-muted-foreground flex-shrink-0 transition-transform',
    answer: 'px-4 sm:px-6 pb-4 sm:pb-6 text-muted-foreground',
  },
})

const styles = faqSectionVariants()

interface FAQSectionRendererProps {
  title?: string | null
  config: FaqConfig
}

export async function FAQSectionRenderer({
  title: customTitle,
  config,
}: FAQSectionRendererProps): Promise<ReactElement | null> {
  const items = config.items || []

  if (items.length === 0) {
    return null
  }

  const displayTitle = customTitle || config.title

  // JSON-LD用データ
  const faqItems = items.map((item) => ({
    question: item.question,
    answer: item.answer,
  }))

  return (
    <>
      <FAQPageJsonLd items={faqItems} />
      <section className={styles.section()}>
        <Container size="md">
          <div className={styles.header()}>
            <h2 className={styles.sectionTitle()}>{displayTitle}</h2>
          </div>
          <div className={styles.list()}>
            {items.slice(0, config.maxItems).map((item, index) => (
              <details key={index} className={styles.item()}>
                <summary className={styles.question()}>
                  <span className={styles.questionText()}>{item.question}</span>
                  <svg
                    className={styles.icon()}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </summary>
                <div className={styles.answer()}>
                  <p className="whitespace-pre-wrap">{item.answer}</p>
                </div>
              </details>
            ))}
          </div>
        </Container>
      </section>
    </>
  )
}
