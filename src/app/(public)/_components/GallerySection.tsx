'use client'

/**
 * GallerySection — Image gallery with grid/masonry/carousel layout
 *
 * CSS grid for standard, CSS columns for masonry, scroll-snap for carousel.
 * Lightbox via native <dialog> element. useGSAP stagger reveal.
 */

import { useRef, useState, type ReactElement } from 'react'
import Image from 'next/image'
import { useGSAP } from '@gsap/react'
import { gsap } from '@/public/lib/gsap-config'
import { ScrollReveal } from '@/public/components/animations/ScrollReveal'
import { SplitText } from '@/public/components/animations/SplitText'
import { SectionWrapper, getTitleClasses, getTitleStyle, getTextStyle } from '@/public/components/sections/SectionWrapper'
import { SectionLabel } from '@/public/components/ui/SectionLabel'
import { DURATION, EASE, STAGGER } from '@/public/lib/animations'
import type { GalleryConfig } from '@/shared/lib/validations/section'
import type { SectionDesign } from '@/shared/lib/validations/section-design'

interface GallerySectionProps {
  readonly config: GalleryConfig
  readonly design: SectionDesign
}

const COLUMNS_MAP = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6',
} as const

const GAP_MAP = {
  none: 'gap-0',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
} as const

const MASONRY_COLUMNS_MAP = {
  1: 'columns-1',
  2: 'columns-1 sm:columns-2',
  3: 'columns-1 sm:columns-2 lg:columns-3',
  4: 'columns-2 lg:columns-4',
  5: 'columns-2 md:columns-3 lg:columns-5',
  6: 'columns-2 md:columns-3 lg:columns-6',
} as const

export function GallerySection({ config, design }: GallerySectionProps): ReactElement {
  const gridRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [lightboxIndex, setLightboxIndex] = useState(-1)

  useGSAP(
    () => {
      const grid = gridRef.current
      if (!grid) return

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const items = grid.querySelectorAll('[data-gallery-item]')
        if (items.length === 0) return

        gsap.fromTo(
          items,
          { y: 30, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: DURATION.slow,
            ease: EASE.outQuart,
            stagger: STAGGER.card * 0.6,
            scrollTrigger: {
              trigger: grid,
              start: 'top 85%',
              toggleActions: 'play none none none',
            },
          },
        )
      })
    },
    { scope: gridRef },
  )

  const openLightbox = (index: number) => {
    if (!config.enableLightbox) return
    setLightboxIndex(index)
    dialogRef.current?.showModal()
  }

  const closeLightbox = () => {
    dialogRef.current?.close()
    setLightboxIndex(-1)
  }

  const navigateLightbox = (direction: 1 | -1) => {
    setLightboxIndex((prev) => {
      const next = prev + direction
      if (next < 0) return config.images.length - 1
      if (next >= config.images.length) return 0
      return next
    })
  }

  if (config.images.length === 0) return <></>

  const gapClass = GAP_MAP[config.gap] ?? GAP_MAP.md
  const colKey = Math.min(Math.max(config.columns, 1), 6)

  const isMasonry = config.layout === 'masonry'
  const isCarousel = config.layout === 'carousel'

  const layoutClass = isCarousel
    ? `flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-4 -mx-5 px-5 md:-mx-8 md:px-8`
    : isMasonry
      ? `${MASONRY_COLUMNS_MAP[colKey as keyof typeof MASONRY_COLUMNS_MAP]} ${gapClass}`
      : `grid ${COLUMNS_MAP[colKey as keyof typeof COLUMNS_MAP]} ${gapClass}`

  return (
    <SectionWrapper design={design}>
      {config.title && (
        <div className="mb-10 text-center md:mb-14">
          <ScrollReveal>
            {config.sectionLabel && <SectionLabel>{config.sectionLabel}</SectionLabel>}
          </ScrollReveal>
          <h2 className={`mt-4 font-heading ${getTitleClasses(design)} font-bold tracking-tight`} style={getTitleStyle(design)}>
            <SplitText variant="words">
              {config.title}
            </SplitText>
          </h2>
        </div>
      )}

      <div ref={gridRef} className={layoutClass}>
        {config.images.map((image, index) => (
          <div
            key={index}
            data-gallery-item=""
            className={`group overflow-hidden rounded-lg ${
              isCarousel ? 'min-w-[280px] snap-center md:min-w-[320px]' : ''
            } ${isMasonry ? 'mb-4 break-inside-avoid' : ''}`}
          >
            <button
              type="button"
              onClick={() => openLightbox(index)}
              className="block w-full overflow-hidden"
              disabled={!config.enableLightbox}
              aria-label={image.alt ?? `ギャラリー画像 ${index + 1} を拡大表示`}
            >
              <Image
                src={image.url}
                alt={image.alt ?? ''}
                width={600}
                height={400}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                sizes={`(max-width: 768px) 100vw, ${Math.round(100 / colKey)}vw`}
              />
            </button>
            {image.caption && (
              <p className="mt-2 text-xs text-muted-foreground" style={getTextStyle(design)}>{image.caption}</p>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {config.enableLightbox && (
        <dialog
          ref={dialogRef}
          className="fixed inset-0 z-50 m-0 h-full w-full max-h-full max-w-full bg-background/95 backdrop:bg-background/80"
          onClick={(e) => {
            if (e.target === dialogRef.current) closeLightbox()
          }}
        >
          {lightboxIndex >= 0 && lightboxIndex < config.images.length && (
            <div className="flex h-full w-full flex-col items-center justify-center p-4">
              <button
                type="button"
                onClick={closeLightbox}
                className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="閉じる"
              >
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="relative flex max-h-[80vh] max-w-[90vw] items-center">
                <button
                  type="button"
                  onClick={() => navigateLightbox(-1)}
                  className="absolute -left-12 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="前の画像"
                >
                  <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <Image
                  src={config.images[lightboxIndex].url}
                  alt={config.images[lightboxIndex].alt ?? ''}
                  width={1200}
                  height={800}
                  className="max-h-[80vh] w-auto rounded-lg object-contain"
                />

                <button
                  type="button"
                  onClick={() => navigateLightbox(1)}
                  className="absolute -right-12 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="次の画像"
                >
                  <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {config.images[lightboxIndex].caption && (
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  {config.images[lightboxIndex].caption}
                </p>
              )}
            </div>
          )}
        </dialog>
      )}
    </SectionWrapper>
  )
}
