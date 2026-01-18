/**
 * スペース一覧ページ
 *
 * @description nuqs を使用した URL State 管理のサンプル実装
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: ページヘッダー
 * - 動的コンテンツ: 検索結果（Suspenseでラップ）
 */

import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { tv } from 'tailwind-variants'
import { cn, formatPrice } from '@/shared/lib/utils'
import { Container, Card, CardContent, CardFooter } from '@/public/components/ui'
import { prisma, type Space, Prisma } from '@/shared/lib/prisma'
import { loadSpaceSearchParams } from '@/shared/lib/nuqs'
import {
  spaceSearchParamsDefaults,
  spaceSearchParamsSchema,
} from '@/shared/lib/validations/search-params'
import { SpaceFilters } from './_components/SpaceFilters'
import { Pagination } from './_components/Pagination'
import { generatePageMetadata } from '@/public/lib/page-metadata'
import type { SearchParams } from 'nuqs/server'
import type { ReactElement } from 'react'

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata('spaces', {
    title: 'スペース一覧',
    description: 'ご利用可能なレンタルスペースの一覧です。',
  })
}

const styles = tv({
  slots: {
    section: 'py-16 bg-background min-h-screen',
    header: 'mb-8',
    title: 'text-3xl font-bold tracking-tight text-foreground',
    subtitle: 'mt-2 text-muted-foreground',
    filtersWrapper: 'mb-8',
    grid: 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3',
    imageWrapper: 'relative aspect-[4/3] overflow-hidden rounded-t-lg',
    image: 'object-cover transition-transform duration-300 hover:scale-105',
    cardTitle: 'text-lg font-semibold text-foreground line-clamp-1',
    description: 'mt-2 text-sm text-muted-foreground line-clamp-2',
    meta: 'flex items-center justify-between text-sm',
    price: 'font-semibold text-primary',
    capacity: 'text-muted-foreground',
    emptyState: 'text-center py-16 text-muted-foreground',
    resultCount: 'text-sm text-muted-foreground mb-4',
  },
})()

interface SpaceCardProps {
  space: Space
  index: number
}

function SpaceCard({ space, index }: SpaceCardProps): ReactElement {
  return (
    <Link href={`/spaces/${space.id}`}>
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-lg">
        <div className={styles.imageWrapper()}>
          <Image
            src={space.mainImageUrl}
            alt={space.name}
            fill
            priority={index < 2}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className={styles.image()}
          />
        </div>
        <CardContent className="p-4">
          <h3 className={styles.cardTitle()}>{space.name}</h3>
          <p className={styles.description()}>
            {space.description.length > 80
              ? space.description.slice(0, 80) + '...'
              : space.description}
          </p>
        </CardContent>
        <CardFooter className={cn(styles.meta(), 'p-4 pt-0')}>
          <span className={styles.price()}>
            {formatPrice(space.hourlyPrice)}/時間
          </span>
          <span className={styles.capacity()}>定員 {space.capacity}名</span>
        </CardFooter>
      </Card>
    </Link>
  )
}

/**
 * 動的コンテンツ: 検索結果
 */
async function SpaceResults({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}): Promise<ReactElement> {
  const { q, page, perPage, sort } = await loadSpaceSearchParams(searchParams)
  const parsedParams = spaceSearchParamsSchema.safeParse({
    q,
    page,
    perPage,
    sort,
  })
  const {
    q: safeQuery,
    page: safePage,
    perPage: safePerPage,
    sort: safeSort,
  } = parsedParams.success ? parsedParams.data : spaceSearchParamsDefaults

  // 検索条件の構築
  const where = {
    isPublished: true,
    isActive: true,
    ...(safeQuery && {
      OR: [
        { name: { contains: safeQuery, mode: 'insensitive' } },
        { description: { contains: safeQuery, mode: 'insensitive' } },
      ],
    }),
  } satisfies Prisma.SpaceWhereInput

  // 並列でデータ取得
  const [spaces, totalCount] = await Promise.all([
    prisma.space.findMany({
      where,
      skip: (safePage - 1) * safePerPage,
      take: safePerPage,
      orderBy: {
        createdAt: safeSort,
      },
    }),
    prisma.space.count({ where }),
  ])

  const totalPages = Math.ceil(totalCount / safePerPage)

  return (
    <>
      {/* 検索結果件数 */}
      <p className={styles.resultCount()}>
        {totalCount}件中 {(safePage - 1) * safePerPage + 1}-
        {Math.min(safePage * safePerPage, totalCount)}件を表示
        {safeQuery && (
          <span className="ml-2">（検索: &quot;{safeQuery}&quot;）</span>
        )}
      </p>

      {/* スペースグリッド */}
      {spaces.length > 0 ? (
        <div className={styles.grid()}>
          {spaces.map((space, index) => (
            <SpaceCard key={space.id} space={space} index={index} />
          ))}
        </div>
      ) : (
        <div className={styles.emptyState()}>
          <p>条件に一致するスペースが見つかりませんでした。</p>
        </div>
      )}

      {/* ページネーション */}
      {totalPages > 1 && (
        <Pagination currentPage={safePage} totalPages={totalPages} />
      )}
    </>
  )
}

/**
 * ローディングUI
 */
function SpaceResultsLoading(): ReactElement {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 bg-muted rounded w-48" />
      <div className={styles.grid()}>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-64 bg-muted rounded-lg" />
        ))}
      </div>
    </div>
  )
}

interface PageProps {
  searchParams: Promise<SearchParams>
}

export default async function SpacesPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  return (
    <section className={styles.section()}>
      <Container>
        {/* 静的シェル: ヘッダー */}
        <header className={styles.header()}>
          <h1 className={styles.title()}>スペース一覧</h1>
          <p className={styles.subtitle()}>
            ご利用可能なレンタルスペースをお探しください
          </p>
        </header>

        {/* クライアントコンポーネント: フィルター */}
        <div className={styles.filtersWrapper()}>
          <SpaceFilters />
        </div>

        {/* 動的コンテンツ: 検索結果 */}
        <Suspense fallback={<SpaceResultsLoading />}>
          <SpaceResults searchParams={searchParams} />
        </Suspense>
      </Container>
    </section>
  )
}
