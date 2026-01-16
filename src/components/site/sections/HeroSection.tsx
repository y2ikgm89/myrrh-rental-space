/**
 * ヒーローセクション
 *
 * HomepageSectionData.config から設定を受け取りレンダリング
 */

import Link from 'next/link'
import Image from 'next/image'
import { tv } from 'tailwind-variants'
import { cn } from '@/lib/utils'
import { buttonVariants, Container } from '@/components/site/ui'
import type { HeroConfig } from '@/lib/validations/homepage-section'
import type { ReactElement } from 'react'

const heroVariants = tv({
  slots: {
    section:
      'relative min-h-[80vh] flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50',
    background:
      'absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.08),transparent_50%),radial-gradient(circle_at_70%_80%,rgba(99,102,241,0.06),transparent_50%)]',
    pattern:
      'absolute inset-0 opacity-[0.03] bg-[url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")]',
    backgroundImage: 'absolute inset-0',
    backgroundOverlay: 'absolute inset-0 bg-black/40',
    content: 'relative z-10 text-center',
    heading:
      'text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl lg:text-7xl',
    headingWithBg:
      'text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl',
    subheading:
      'mx-auto mt-6 max-w-2xl text-lg text-gray-600 sm:text-xl md:text-2xl',
    subheadingWithBg:
      'mx-auto mt-6 max-w-2xl text-lg text-gray-200 sm:text-xl md:text-2xl',
    buttonGroup:
      'mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6',
  },
})

const variants = heroVariants()

interface HeroSectionProps {
  config: HeroConfig
}

export function HeroSection({ config }: HeroSectionProps): ReactElement {
  const hasBackgroundImage = !!config.backgroundImageUrl

  return (
    <section className={cn(variants.section())}>
      {/* Background image (if set) */}
      {hasBackgroundImage && config.backgroundImageUrl && (
        <>
          <div className={cn(variants.backgroundImage())}>
            <Image
              src={config.backgroundImageUrl}
              alt=""
              fill
              priority
              className="object-cover"
            />
          </div>
          <div className={cn(variants.backgroundOverlay())} aria-hidden="true" />
        </>
      )}

      {/* Background gradient overlay (if no image) */}
      {!hasBackgroundImage && (
        <>
          <div className={cn(variants.background())} aria-hidden="true" />
          <div className={cn(variants.pattern())} aria-hidden="true" />
        </>
      )}

      {/* Content */}
      <Container className={cn(variants.content())}>
        <h1
          className={cn(
            hasBackgroundImage ? variants.headingWithBg() : variants.heading()
          )}
        >
          {config.title}
        </h1>

        {config.subtitle && (
          <p
            className={cn(
              hasBackgroundImage ? variants.subheadingWithBg() : variants.subheading()
            )}
          >
            {config.subtitle}
          </p>
        )}

        <div className={cn(variants.buttonGroup())}>
          <Link
            href={config.ctaPrimary.url}
            className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}
          >
            {config.ctaPrimary.text}
          </Link>

          {config.ctaSecondary?.text && config.ctaSecondary?.url && (
            <Link
              href={config.ctaSecondary.url}
              className={cn(
                buttonVariants({
                  variant: hasBackgroundImage ? 'secondary' : 'outline',
                  size: 'lg',
                })
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
