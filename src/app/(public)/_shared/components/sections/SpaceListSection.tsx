/**
 * スペース一覧セクション
 *
 * HomepageSectionData.config から設定を受け取りレンダリング
 * Next.js 16 PPR対応: use cache ディレクティブでキャッシュ
 */

import Link from 'next/link'
import Image from 'next/image'
import { cacheLife, cacheTag } from 'next/cache'
import { tv } from 'tailwind-variants'
import { cn, formatPrice } from '@/shared/lib/utils'
import { Container, Card, CardContent, CardFooter } from '@/public/components/ui'
import { prisma } from '@/shared/lib/prisma'
import { logger } from '@/shared/lib/logger'
import type { SpaceListConfig } from '@/shared/lib/validations/homepage-section'
import type { ReactElement } from 'react'

/**
 * SpaceCard表示用の最小フィールド型
 * DBから必要なフィールドのみを取得してパフォーマンス最適化
 */
type SpaceCardData = {
  id: string
  name: string
  description: string
  hourlyPrice: number
  mainImageUrl: string
  capacity: number
}

const spaceListVariants = tv({
  slots: {
    section: 'py-16 bg-background',
    header: 'text-center mb-12',
    title: 'text-3xl font-bold tracking-tight text-foreground',
    grid: 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3',
    imageWrapper: 'relative aspect-[4/3] overflow-hidden rounded-t-lg',
    image: 'object-cover transition-transform duration-300 hover:scale-105',
    cardTitle: 'text-lg font-semibold text-foreground line-clamp-1',
    description: 'mt-2 text-sm text-muted-foreground line-clamp-2',
    meta: 'flex items-center justify-between text-sm',
    price: 'font-semibold text-primary',
    capacity: 'text-muted-foreground',
    moreLink: 'mt-12 text-center',
    moreLinkAnchor:
      'inline-flex items-center gap-2 text-primary hover:text-primary/80 font-medium transition-colors',
    emptyState: 'text-center py-16 text-muted-foreground',
  },
})

const {
  section,
  header,
  title,
  grid,
  imageWrapper,
  image,
  cardTitle,
  description,
  meta,
  price,
  capacity,
  moreLink,
  moreLinkAnchor,
  emptyState,
} = spaceListVariants()

function truncateDescription(text: string, maxLength: number = 80): string {
  if (text.length <= maxLength) {
    return text
  }
  return text.slice(0, maxLength) + '...'
}

interface SpaceCardProps {
  space: SpaceCardData
  priority?: boolean
}

function SpaceCard({ space, priority = false }: SpaceCardProps): ReactElement {
  return (
    <Link href={`/spaces/${space.id}`}>
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-lg">
        <div className={imageWrapper()}>
          <Image
            src={space.mainImageUrl}
            alt={space.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className={image()}
            priority={priority}
            loading={priority ? 'eager' : 'lazy'}
          />
        </div>
        <CardContent className="p-4">
          <h3 className={cardTitle()}>{space.name}</h3>
          <p className={description()}>{truncateDescription(space.description)}</p>
        </CardContent>
        <CardFooter className={cn(meta(), 'p-4 pt-0')}>
          <span className={price()}>{formatPrice(space.hourlyPrice)}/時間</span>
          <span className={capacity()}>定員 {space.capacity}名</span>
        </CardFooter>
      </Card>
    </Link>
  )
}

async function getSpaces(
  maxItems: number,
  showOnlyPublished: boolean
): Promise<SpaceCardData[]> {
  'use cache'
  cacheLife('minutes')
  cacheTag('spaces')

  try {
    const spaces = await prisma.space.findMany({
      where: showOnlyPublished
        ? {
            isPublished: true,
            isActive: true,
          }
        : {
            isActive: true,
          },
      take: maxItems,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        description: true,
        hourlyPrice: true,
        mainImageUrl: true,
        capacity: true,
      },
    })

    // Decimal型をnumberに変換
    return spaces.map((space) => ({
      id: space.id,
      name: space.name,
      description: space.description,
      hourlyPrice: Number(space.hourlyPrice),
      mainImageUrl: space.mainImageUrl,
      capacity: space.capacity,
    }))
  } catch (error) {
    logger.error('SpaceListSection: Failed to fetch spaces', {
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

interface SpaceListSectionProps {
  title?: string | null
  config: SpaceListConfig
}

export async function SpaceListSection({
  title: customTitle,
  config,
}: SpaceListSectionProps): Promise<ReactElement> {
  const spaces = await getSpaces(config.maxItems, config.showOnlyPublished)

  return (
    <section className={section()}>
      <Container>
        <div className={header()}>
          <h2 className={title()}>{customTitle || '人気のスペース'}</h2>
        </div>

        {spaces.length > 0 ? (
          <>
            <div className={grid()}>
              {spaces.map((space, index) => (
                <SpaceCard key={space.id} space={space} priority={index === 0} />
              ))}
            </div>
            <div className={moreLink()}>
              <Link href="/spaces" className={moreLinkAnchor()}>
                もっと見る
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            </div>
          </>
        ) : (
          <div className={emptyState()}>
            <p>現在公開中のスペースはありません。</p>
          </div>
        )}
      </Container>
    </section>
  )
}
