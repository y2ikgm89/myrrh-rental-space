/**
 * ヒーローセクション
 *
 * HomepageSectionData.config / PageSectionData.config から設定を受け取りレンダリング
 *
 * ## デザイン変更時の注意
 * - 背景画像なし: テーマ変数（foreground, muted-foreground等）を使用
 * - 背景画像あり: オーバーレイの上に白テキストを表示（視認性確保のため固定色）
 * - 共通スタイルはsection-variants.tsを参照
 */

import Link from 'next/link'
import Image from 'next/image'
import { tv } from 'tailwind-variants'
import { cn } from '@/shared/lib/utils'
import { buttonVariants, Container } from '@/public/components/ui'
import {
  imageOverlayClasses,
  overlayTextClasses,
} from '@/public/lib/styles/section-variants'
import type { CTAButtonItem } from '@/shared/lib/validations/section-design'
import {
  getCustomColorStyle,
  hasCustomColors,
  CUSTOM_COLOR_HOVER_CLASS,
} from './cta-button-styles'
import type { ReactElement } from 'react'

/**
 * HeroConfig型
 *
 * homepage-sectionとpage-sectionで共通のインターフェース
 */
interface HeroConfig {
  title: string
  subtitle?: string
  backgroundImageUrl?: string
  buttons: CTAButtonItem[]
}

const heroVariants = tv({
  slots: {
    section:
      'relative min-h-[80vh] flex items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-accent/20',
    background:
      'absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.08),transparent_50%),radial-gradient(circle_at_70%_80%,hsl(var(--accent)/0.06),transparent_50%)]',
    pattern:
      'absolute inset-0 opacity-[0.03] bg-[url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")]',
    backgroundImage: 'absolute inset-0',
    backgroundOverlay: '', // imageOverlayClassesを使用
    content: 'relative z-10 text-center',
    // テーマ変数を使用（背景画像なし）
    heading:
      'text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl',
    subheading:
      'mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl md:text-2xl',
    // オーバーレイ上のテキスト（背景画像あり）- 白固定
    headingWithBg:
      'text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl',
    subheadingWithBg:
      'mx-auto mt-6 max-w-2xl text-lg sm:text-xl md:text-2xl',
    buttonGroup:
      'mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6',
  },
})

const variants = heroVariants()

interface HeroSectionProps {
  config: HeroConfig
}

/**
 * ボタンvariantをshadcn/uiのvariantにマッピング
 */
function mapHeroButtonVariant(
  variant: CTAButtonItem['variant'],
  hasBackgroundImage: boolean,
): 'primary' | 'secondary' | 'outline' | 'ghost' {
  if (variant === 'primary') return 'primary'
  if (hasBackgroundImage) return 'secondary'
  return variant
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
          <div
            className={cn('absolute inset-0', imageOverlayClasses.medium)}
            aria-hidden="true"
          />
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
            hasBackgroundImage ? variants.headingWithBg() : variants.heading(),
            hasBackgroundImage && overlayTextClasses.primary
          )}
        >
          {config.title}
        </h1>

        {config.subtitle && (
          <p
            className={cn(
              hasBackgroundImage ? variants.subheadingWithBg() : variants.subheading(),
              hasBackgroundImage && overlayTextClasses.secondary
            )}
          >
            {config.subtitle}
          </p>
        )}

        {config.buttons.length > 0 && (
          <div className={cn(variants.buttonGroup())}>
            {config.buttons.map((button, index) => (
              <Link
                key={index}
                href={button.url}
                target={button.openInNewTab ? '_blank' : undefined}
                rel={button.openInNewTab ? 'noopener noreferrer' : undefined}
                className={cn(
                  buttonVariants({
                    variant: mapHeroButtonVariant(button.variant, hasBackgroundImage),
                    size: button.size,
                  }),
                  hasCustomColors(button) && CUSTOM_COLOR_HOVER_CLASS
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
