import Link from 'next/link'
import Image from 'next/image'
import { tv } from 'tailwind-variants'
import { cn } from '@/lib/utils'
import { Container, Card, CardContent, CardFooter } from '@/components/site/ui'
import { prisma } from '@/lib/prisma'
import type { Space } from '@/generated/prisma/client/client'
import type { ReactElement } from 'react'

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

/**
 * 価格をフォーマット（日本円）
 */
function formatPrice(value: unknown): string {
  if (value === null || value === undefined) {
    return '要問合せ'
  }
  const numValue = typeof value === 'number' ? value : Number(value)
  if (isNaN(numValue)) {
    return '要問合せ'
  }
  return `¥${numValue.toLocaleString('ja-JP')}`
}

/**
 * 説明文を切り詰め
 */
function truncateDescription(text: string, maxLength: number = 80): string {
  if (text.length <= maxLength) {
    return text
  }
  return text.slice(0, maxLength) + '...'
}

interface SpaceCardProps {
  space: Space
}

function SpaceCard({ space }: SpaceCardProps): ReactElement {
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

export async function SpaceList(): Promise<ReactElement> {
  const spaces = await prisma.space.findMany({
    where: {
      isPublished: true,
      isActive: true,
    },
    take: 6,
    orderBy: {
      createdAt: 'desc',
    },
  })

  return (
    <section className={section()}>
      <Container>
        <div className={header()}>
          <h2 className={title()}>人気のスペース</h2>
        </div>

        {spaces.length > 0 ? (
          <>
            <div className={grid()}>
              {spaces.map((space) => (
                <SpaceCard key={space.id} space={space} />
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
