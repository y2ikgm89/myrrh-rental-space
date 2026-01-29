/**
 * ギャラリーセクション
 *
 * 共通スタイルを使用してデザイン変更に対応
 */

import Image from 'next/image'
import type { ReactElement } from 'react'
import type { GalleryConfig } from '@/shared/lib/validations/page-section'
import {
  sectionVariants,
  sectionTitleVariants,
  getGridColumnClass,
  getGridGapClass,
  getMasonryColumnClass,
  imageOverlayClasses,
  overlayTextClasses,
} from '@/public/lib/styles/section-variants'

interface GallerySectionProps {
  title?: string | null
  config: GalleryConfig
}

interface ImageCaptionOverlayProps {
  caption?: string
}

function ImageCaptionOverlay({ caption }: ImageCaptionOverlayProps): ReactElement | null {
  if (!caption) return null
  return (
    <div className={`absolute inset-x-0 bottom-0 ${imageOverlayClasses.captionGradient} p-4`}>
      <p className={`${overlayTextClasses.primary} text-sm`}>{caption}</p>
    </div>
  )
}

export function GallerySection({
  title,
  config,
}: GallerySectionProps): ReactElement {
  const { images, layout, columns, gap } = config

  if (images.length === 0) {
    return (
      <section className={sectionVariants()}>
        <div className="container">
          {title && (
            <h2 className={sectionTitleVariants()}>{title}</h2>
          )}
          <p className="text-center text-muted-foreground">
            ギャラリー画像が設定されていません
          </p>
        </div>
      </section>
    )
  }

  const gapClass = getGridGapClass(gap)
  const columnClass = getGridColumnClass(columns)

  return (
    <section className={sectionVariants()}>
      <div className="container">
        {title && (
          <h2 className={sectionTitleVariants()}>{title}</h2>
        )}

        {layout === 'grid' && (
          <div className={`grid ${columnClass} ${gapClass}`}>
            {images.map((image, index) => (
              <div key={index} className="relative aspect-square overflow-hidden rounded-lg">
                <Image
                  src={image.url}
                  alt={image.alt || `ギャラリー画像 ${index + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
                <ImageCaptionOverlay caption={image.caption} />
              </div>
            ))}
          </div>
        )}

        {layout === 'masonry' && (
          <div className={`${getMasonryColumnClass(columns)} ${gapClass}`}>
            {images.map((image, index) => (
              <div key={index} className="mb-4 break-inside-avoid">
                <div className="relative overflow-hidden rounded-lg">
                  <Image
                    src={image.url}
                    alt={image.alt || `ギャラリー画像 ${index + 1}`}
                    width={800}
                    height={600}
                    className="w-full h-auto object-cover"
                  />
                  <ImageCaptionOverlay caption={image.caption} />
                </div>
              </div>
            ))}
          </div>
        )}

        {layout === 'carousel' && (
          <div className="overflow-x-auto pb-4 -mx-4 px-4">
            <div className={`flex ${gapClass}`}>
              {images.map((image, index) => (
                <div key={index} className="flex-none w-72 md:w-80 lg:w-96">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-lg">
                    <Image
                      src={image.url}
                      alt={image.alt || `ギャラリー画像 ${index + 1}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 288px, (max-width: 1024px) 320px, 384px"
                    />
                    <ImageCaptionOverlay caption={image.caption} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
