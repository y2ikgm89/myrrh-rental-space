/**
 * 体験談・レビューセクション
 *
 * 共通スタイルを使用してデザイン変更に対応
 */

import Image from 'next/image'
import type { ReactElement } from 'react'
import { Star } from 'lucide-react'
import type { TestimonialConfig } from '@/shared/lib/validations/page-section'
import {
  sectionVariants,
  sectionTitleVariants,
  cardVariants,
  getGridGapClass,
  ratingStarClasses,
} from '@/public/lib/styles/section-variants'

interface TestimonialSectionProps {
  title?: string | null
  config: TestimonialConfig
}

interface TestimonialItem {
  content: string
  authorName: string
  authorTitle?: string
  authorImageUrl?: string
  rating?: number
}

/**
 * 星評価コンポーネント
 *
 * 星の色はsection-variants.tsで一元管理
 */
function StarRating({ rating }: { rating: number }): ReactElement {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= rating
              ? ratingStarClasses.filled
              : ratingStarClasses.empty
          }`}
        />
      ))}
    </div>
  )
}

interface TestimonialCardProps {
  item: TestimonialItem
  showRating: boolean
  className?: string
  truncateContent?: boolean
}

function TestimonialCard({
  item,
  showRating,
  className = '',
  truncateContent = false,
}: TestimonialCardProps): ReactElement {
  return (
    <div className={`${cardVariants()} ${className}`}>
      {showRating && item.rating && (
        <div className="mb-3">
          <StarRating rating={item.rating} />
        </div>
      )}
      <blockquote className={`text-muted-foreground mb-4 ${truncateContent ? 'line-clamp-4' : ''}`}>
        &ldquo;{item.content}&rdquo;
      </blockquote>
      <div className="flex items-center gap-3">
        {item.authorImageUrl && (
          <div className="relative h-10 w-10 overflow-hidden rounded-full">
            <Image
              src={item.authorImageUrl}
              alt={item.authorName}
              fill
              className="object-cover"
            />
          </div>
        )}
        <div>
          <p className="font-medium text-foreground">{item.authorName}</p>
          {item.authorTitle && (
            <p className="text-sm text-muted-foreground">
              {item.authorTitle}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export function TestimonialSection({
  title,
  config,
}: TestimonialSectionProps): ReactElement {
  const { items, layout, showRating } = config

  if (items.length === 0) {
    return (
      <section className={sectionVariants({ background: 'muted' })}>
        <div className="container">
          {title && (
            <h2 className={sectionTitleVariants()}>{title}</h2>
          )}
          <p className="text-center text-muted-foreground">
            レビューが設定されていません
          </p>
        </div>
      </section>
    )
  }

  const gapClass = getGridGapClass('lg')

  return (
    <section className={sectionVariants({ background: 'muted' })}>
      <div className="container">
        {title && (
          <h2 className={sectionTitleVariants()}>{title}</h2>
        )}

        {layout === 'grid' && (
          <div className={`grid md:grid-cols-2 lg:grid-cols-3 ${gapClass}`}>
            {items.map((item, index) => (
              <TestimonialCard key={index} item={item} showRating={showRating} />
            ))}
          </div>
        )}

        {layout === 'list' && (
          <div className="space-y-6 max-w-2xl mx-auto">
            {items.map((item, index) => (
              <TestimonialCard key={index} item={item} showRating={showRating} />
            ))}
          </div>
        )}

        {layout === 'carousel' && (
          <div className="overflow-x-auto pb-4 -mx-4 px-4">
            <div className={`flex ${gapClass}`}>
              {items.map((item, index) => (
                <TestimonialCard
                  key={index}
                  item={item}
                  showRating={showRating}
                  className="flex-none w-80 md:w-96"
                  truncateContent
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
