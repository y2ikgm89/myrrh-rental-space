/**
 * お知らせ一覧ページ
 *
 * @description nuqs を使用した URL State 管理でページネーション実装
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: ページヘッダー
 * - 動的コンテンツ: 検索結果（Suspenseでラップ）
 */

import { Suspense } from 'react'
import type { Metadata } from 'next'
import { tv } from 'tailwind-variants'
import { Container } from '@/components/site/ui'
import { prisma } from '@/lib/prisma'
import { loadNewsSearchParams } from '@/lib/nuqs'
import { NewsList, NewsPagination } from './_components'
import type { SearchParams } from 'nuqs/server'
import type { ReactElement } from 'react'

export const metadata: Metadata = {
  title: 'お知らせ',
  description: 'Myrrh Rental Space からの最新のお知らせ一覧です。',
}

const styles = tv({
  slots: {
    section: 'py-16 bg-background min-h-screen',
    header: 'mb-8',
    title: 'text-3xl font-bold tracking-tight text-foreground',
    subtitle: 'mt-2 text-muted-foreground',
    resultCount: 'text-sm text-muted-foreground mb-4',
  },
})()

/**
 * 動的コンテンツ: お知らせ一覧
 */
async function NewsResults({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}): Promise<ReactElement> {
  const { page, perPage } = await loadNewsSearchParams(searchParams)

  // 安全なパラメータ（デフォルト値でフォールバック）
  const safePage = page > 0 ? page : 1
  const safePerPage = perPage > 0 && perPage <= 50 ? perPage : 10

  const where = {
    isPublished: true,
    publishedAt: { not: null },
  }

  const [newsList, totalCount] = await Promise.all([
    prisma.news.findMany({
      where,
      skip: (safePage - 1) * safePerPage,
      take: safePerPage,
      orderBy: {
        publishedAt: 'desc',
      },
      select: {
        id: true,
        title: true,
        content: true,
        publishedAt: true,
      },
    }),
    prisma.news.count({ where }),
  ])

  const totalPages = Math.ceil(totalCount / safePerPage)
  const startCount = totalCount === 0 ? 0 : (safePage - 1) * safePerPage + 1
  const endCount =
    totalCount === 0 ? 0 : Math.min(safePage * safePerPage, totalCount)

  return (
    <>
      <p className={styles.resultCount()}>
        {totalCount}件中 {startCount}-{endCount}件を表示
      </p>

      <NewsList newsList={newsList} />

      {totalPages > 1 && (
        <NewsPagination currentPage={safePage} totalPages={totalPages} />
      )}
    </>
  )
}

/**
 * ローディングUI
 */
function NewsResultsLoading(): ReactElement {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 bg-muted rounded w-48" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-24 bg-muted rounded-lg" />
      ))}
    </div>
  )
}

interface PageProps {
  searchParams: Promise<SearchParams>
}

export default async function NewsPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  return (
    <section className={styles.section()}>
      <Container>
        {/* 静的シェル: ヘッダー */}
        <header className={styles.header()}>
          <h1 className={styles.title()}>お知らせ</h1>
          <p className={styles.subtitle()}>
            最新のお知らせ・キャンペーン情報をお届けします
          </p>
        </header>

        {/* 動的コンテンツ: お知らせ一覧 */}
        <Suspense fallback={<NewsResultsLoading />}>
          <NewsResults searchParams={searchParams} />
        </Suspense>
      </Container>
    </section>
  )
}
