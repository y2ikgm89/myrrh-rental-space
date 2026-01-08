import Link from 'next/link'
import { tv } from 'tailwind-variants'
import { cn } from '@/lib/utils'
import { Container, buttonVariants } from '@/components/site/ui'
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

const { section, wrapper, heading, subtext, buttonGroup } = ctaVariants()

export function CTA(): ReactElement {
  return (
    <section className={section()}>
      <Container size="md" className={wrapper()}>
        <h2 className={heading()}>ご予約・お問い合わせ</h2>
        <p className={subtext()}>
          ご不明な点がございましたら、お気軽にお問い合わせください
        </p>
        <div className={buttonGroup()}>
          <Link
            href="/reservation"
            className={cn(
              buttonVariants({ size: 'lg' }),
              'bg-primary-foreground text-primary hover:bg-primary-foreground/90'
            )}
          >
            予約する
          </Link>
          <Link
            href="/contact"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'lg' }),
              'border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary'
            )}
          >
            お問い合わせ
          </Link>
        </div>
      </Container>
    </section>
  )
}
