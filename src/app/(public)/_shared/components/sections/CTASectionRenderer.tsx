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
import type { CTAButtonItem } from '@/shared/lib/validations/section-design'
import {
  getCustomColorStyle,
  hasCustomColors,
  CUSTOM_COLOR_HOVER_CLASS,
} from './cta-button-styles'
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

/**
 * CTA背景（bg-primary）上でのボタンスタイルマッピング
 */
function getCtaButtonClasses(variant: CTAButtonItem['variant']): string {
  switch (variant) {
    case 'primary':
      return 'bg-primary-foreground text-primary hover:bg-primary-foreground/90'
    case 'secondary':
    case 'outline':
      return 'border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary'
    case 'ghost':
      return 'text-primary-foreground hover:bg-primary-foreground/10'
    default: {
      const _exhaustive: never = variant
      return _exhaustive
    }
  }
}

export function CTASectionRenderer({ config }: CTASectionRendererProps): ReactElement {
  return (
    <section className={styles.section()}>
      <Container size="md" className={styles.wrapper()}>
        <h2 className={styles.heading()}>{config.title}</h2>
        {config.description && <p className={styles.subtext()}>{config.description}</p>}
        {config.buttons.length > 0 && (
          <div className={styles.buttonGroup()}>
            {config.buttons.map((button, index) => (
              <Link
                key={index}
                href={button.url}
                target={button.openInNewTab ? '_blank' : undefined}
                rel={button.openInNewTab ? 'noopener noreferrer' : undefined}
                className={cn(
                  buttonVariants({
                    variant: button.variant === 'primary' ? 'primary' : 'outline',
                    size: button.size,
                  }),
                  hasCustomColors(button)
                    ? CUSTOM_COLOR_HOVER_CLASS
                    : getCtaButtonClasses(button.variant)
                )}
                style={getCustomColorStyle(button)}
              >
                {button.text}
              </Link>
            ))}
          </div>
        )}
      </Container>
    </section>
  )
}
