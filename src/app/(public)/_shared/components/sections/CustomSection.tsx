/**
 * カスタムセクション
 *
 * Lexical HTMLコンテンツをレンダリング
 */

import { tv } from 'tailwind-variants'
import { cn } from '@/shared/lib/utils'
import { Container } from '@/public/components/ui'
import { ContentRenderer } from '@/public/components/ContentRenderer'
import type { CustomConfig } from '@/shared/lib/validations/homepage-section'
import type { ReactElement } from 'react'

const customSectionVariants = tv({
  slots: {
    section: 'py-16 sm:py-20 lg:py-24',
    header: 'text-center mb-12',
    sectionTitle: 'text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight',
  },
})

const styles = customSectionVariants()

interface CustomSectionProps {
  title?: string | null
  content?: string | null
  config: CustomConfig
}

export async function CustomSection({
  title,
  content,
  config,
}: CustomSectionProps): Promise<ReactElement | null> {
  if (!content) {
    return null
  }

  return (
    <section className={cn(styles.section(), config.containerClass)}>
      <Container>
        {title && (
          <div className={styles.header()}>
            <h2 className={styles.sectionTitle()}>{title}</h2>
          </div>
        )}
        <ContentRenderer html={content} />
      </Container>
    </section>
  )
}
