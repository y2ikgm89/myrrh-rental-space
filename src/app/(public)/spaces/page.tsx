/**
 * スペース一覧ページ
 *
 * @description nuqs を使用した URL State 管理のサンプル実装
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { tv } from 'tailwind-variants'
import { cn } from '@/lib/utils'
import { Container, Card, CardContent, CardFooter } from '@/components/site/ui'
import { prisma } from '@/lib/prisma'
import { loadSpaceSearchParams, type SortOrder } from '@/lib/nuqs'
import { SpaceFilters } from './_components/SpaceFilters'
import { Pagination } from './_components/Pagination'
import type { Space } from '@/generated/prisma/client/client'
import type { SearchParams } from 'nuqs/server'

export const metadata: Metadata = {
  title: 'スペース一覧',
  description: 'ご利用可能なレンタルスペースの一覧です。',
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

function formatPrice(value: unknown): string {
  if (value === null || value === undefined) return '要問合せ'
  const numValue = typeof value === 'number' ? value : Number(value)
  if (isNaN(numValue)) return '要問合せ'
  return `¥${numValue.toLocaleString('ja-JP')}`
}

function SpaceCard({ space }: { space: Space }) {
  return (
    <Link href={`/spaces/${space.id}`}>
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-lg">
        <div className={styles.imageWrapper()}>
          <Image
            src={space.mainImageUrl}
            alt={space.name}
            fill
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

type PageProps = {
  searchParams: Promise<SearchParams>
}

export default async function SpacesPage({ searchParams }: PageProps) {
  // nuqs: Server Component でのパラメータ読み込み
  const { q, page, perPage, sort } = await loadSpaceSearchParams(searchParams)

  // 検索条件の構築
  const where = {
    isPublished: true,
    isActive: true,
    ...(q && {
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { description: { contains: q, mode: 'insensitive' as const } },
      ],
    }),
  }

  // 並列でデータ取得
  const [spaces, totalCount] = await Promise.all([
    prisma.space.findMany({
      where,
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: {
        createdAt: sort as SortOrder,
      },
    }),
    prisma.space.count({ where }),
  ])

  const totalPages = Math.ceil(totalCount / perPage)

  return (
    <section className={styles.section()}>
      <Container>
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

        {/* 検索結果件数 */}
        <p className={styles.resultCount()}>
          {totalCount}件中 {(page - 1) * perPage + 1}-
          {Math.min(page * perPage, totalCount)}件を表示
          {q && <span className="ml-2">（検索: &quot;{q}&quot;）</span>}
        </p>

        {/* スペースグリッド */}
        {spaces.length > 0 ? (
          <div className={styles.grid()}>
            {spaces.map((space) => (
              <SpaceCard key={space.id} space={space} />
            ))}
          </div>
        ) : (
          <div className={styles.emptyState()}>
            <p>条件に一致するスペースが見つかりませんでした。</p>
          </div>
        )}

        {/* ページネーション */}
        {totalPages > 1 && (
          <Pagination currentPage={page} totalPages={totalPages} />
        )}
      </Container>
    </section>
  )
}
