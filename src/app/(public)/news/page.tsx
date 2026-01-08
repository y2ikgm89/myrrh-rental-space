/**
 * お知らせ一覧ページ
 *
 * @description nuqs を使用した URL State 管理でページネーション実装
 */

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

interface PageProps {
  searchParams: Promise<SearchParams>
}

export default async function NewsPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
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
    <section className={styles.section()}>
      <Container>
        <header className={styles.header()}>
          <h1 className={styles.title()}>お知らせ</h1>
          <p className={styles.subtitle()}>
            最新のお知らせ・キャンペーン情報をお届けします
          </p>
        </header>

        <p className={styles.resultCount()}>
          {totalCount}件中 {startCount}-{endCount}件を表示
        </p>

        <NewsList newsList={newsList} />

        {totalPages > 1 && (
          <NewsPagination currentPage={safePage} totalPages={totalPages} />
        )}
      </Container>
    </section>
  )
}
