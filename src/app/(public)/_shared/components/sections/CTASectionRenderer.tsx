/**
 * CTAセクション（新API対応）
 *
 * HomepageSectionData.config から設定を受け取りレンダリング
 */

import Link from 'next/link'
import { tv } from 'tailwind-variants'
import { cn } from '@/shared/lib/utils'
import { Container, buttonVariants } from '@/public/components/ui'
import type { CtaConfig } from '@/shared/lib/validations/homepage-section'
import type { ReactElement } from 'react'

const ctaVariants = tv({
  slots: {
    section: 'py-16 sm:py-20 lg:py-24 bg-primary text-primary-foreground',
    wrapper: 'text-center',
    heading: 'text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight',
    subtext: 'mt-4 text-base sm:text-lg text-primary-foreground/80 max-w-2xl mx-auto',
    buttonGroup: 'mt-8 flex flex-col sm:flex-row items-center justify-center gap-4',
  },
})

const styles = ctaVariants()

interface CTASectionRendererProps {
  config: CtaConfig
}

export function CTASectionRenderer({ config }: CTASectionRendererProps): ReactElement {
  return (
    <section className={styles.section()}>
      <Container size="md" className={styles.wrapper()}>
        <h2 className={styles.heading()}>{config.title}</h2>
        {config.description && <p className={styles.subtext()}>{config.description}</p>}
        <div className={styles.buttonGroup()}>
          <Link
            href={config.ctaPrimary.url}
            className={cn(
              buttonVariants({ size: 'lg' }),
              'bg-primary-foreground text-primary hover:bg-primary-foreground/90'
            )}
          >
            {config.ctaPrimary.text}
          </Link>
          {config.ctaSecondary?.text && config.ctaSecondary?.url && (
            <Link
              href={config.ctaSecondary.url}
              className={cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                'border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary'
              )}
            >
              {config.ctaSecondary.text}
            </Link>
          )}
        </div>
      </Container>
    </section>
  )
}
